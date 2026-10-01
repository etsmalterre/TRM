import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CalendarClock, CalendarRange, ChevronLeft, ChevronRight, ExternalLink, Factory, Gauge,
  Loader2, Pin, Search, Undo2, X,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PopoverSelect } from '@/components/ui/popover-select'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { useElementSize } from '@/hooks/useElementSize'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { RegimeDialog } from '@/components/planning/RegimeDialog'
import {
  JOUR_MS, REGIME_LIBELLES, cleSegment, fermetures, fmtDelai, fmtDuree, fmtInstant, joursEntre, minuit,
  ordreApresDepot,
  type Plan, type PlanLigne, type PlanOf, type PlanSegment, type RegimeId, type SemaineHoraires,
} from '@/lib/planning-prod'

// Production › Planning (LIVA #1250) — port of the legacy FI_Planning_Commande:
// métiers on the left, every commande line still to knit on a timeline. The
// API computes every date (ETM/apps/api/src/lib/planning-prod-trm.ts); this
// screen draws them and turns a drag into « this métier, in this order ».
//
// Layout: « Tableau » (mps_designer §27) — toolbar, the timeline card as the
// working surface, the right slide-in drawer for the selected bar. No edit
// mode: a drop is saved at once and dates follow on the refetch.

const QK = ['planning-prod-trm'] as const
const LABEL_W = 120 // px, the métier column
const ROW_H = 48
const VUES = [
  { jours: 14, label: '2 sem.' },
  { jours: 28, label: '4 sem.' },
  { jours: 56, label: '8 sem.' },
] as const

type Selection = string | null // cleSegment() (`of:<id>` / `ligne:<id>`), or `sans-metier:<id>` for a line no métier can knit

interface Drag {
  seg: PlanSegment
  x0: number
  y0: number
  dx: number
  dy: number
  moved: boolean
  machine: number | null
  instant: number
}

function erreurMessage(err: unknown, repli: string): string {
  const body = (err as { body?: { message?: string } })?.body
  return body?.message || repli
}

export function ProductionPlanning() {
  const qc = useQueryClient()
  const canLigne = useHasPermission('edit_planning_prod')
  const canOf = useHasPermission('edit_of')
  const isDesktop = useIsDesktop()
  const [searchParams] = useSearchParams()
  const embed = searchParams.get('embed') === 'true'

  const { data: plan, isLoading, isError } = useQuery({
    queryKey: QK,
    queryFn: () => apiFetch<Plan>('/planning-prod-trm'),
    refetchInterval: 60_000,
  })

  const [jours, setJours] = useState<number>(28)
  const [decalage, setDecalage] = useState(0) // days from today
  const [q, setQ] = useState('')
  const [selection, setSelection] = useState<Selection>(null)
  const [regimeOpen, setRegimeOpen] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // ── Indexes ────────────────────────────────────────────
  const ligneById = useMemo(() => new Map((plan?.lignes ?? []).map((l) => [l.ligne_id, l])), [plan])
  const ofById = useMemo(() => new Map((plan?.ofs ?? []).map((o) => [o.id, o])), [plan])
  const segmentsParMachine = useMemo(() => {
    const m = new Map<number, PlanSegment[]>()
    for (const s of plan?.segments ?? []) {
      const list = m.get(s.idmachine) ?? []
      list.push(s)
      m.set(s.idmachine, list)
    }
    return m
  }, [plan])

  const nq = q.trim().toLowerCase()
  const correspond = useCallback((s: PlanSegment): boolean => {
    if (!nq) return true
    const l = ligneById.get(s.ligneId)
    const o = s.type === 'of' ? ofById.get(s.id) : undefined
    const hay = [
      l?.numero, l?.client, l?.reference, l?.coloris, o?.reference, o?.coloris, s.type === 'of' ? `of ${s.id}` : '',
    ].join(' ').toLowerCase()
    return hay.includes(nq)
  }, [nq, ligneById, ofById])

  const enRetard = useMemo(() => (plan?.lignes ?? []).filter((l) => l.en_retard), [plan])
  const nonPlanifiables = useMemo(() => (plan?.lignes ?? []).filter((l) => l.non_planifiable), [plan])

  // ── Mutations ──────────────────────────────────────────
  const onDone = () => { setErreur(null); void qc.invalidateQueries({ queryKey: QK }); void qc.invalidateQueries({ queryKey: ['planning-prod-trm-fins'] }) }
  const placerLigne = useMutation({
    mutationFn: (v: { id: number; idmachine: number; ordre: number[] }) =>
      apiFetch(`/planning-prod-trm/lignes/${v.id}`, { method: 'PUT', body: JSON.stringify({ idmachine: v.idmachine, ordre: v.ordre }) }),
    onSuccess: onDone,
    onError: (e) => setErreur(erreurMessage(e, 'Déplacement impossible.')),
  })
  const automatique = useMutation({
    mutationFn: (id: number) => apiFetch(`/planning-prod-trm/lignes/${id}`, { method: 'DELETE' }),
    onSuccess: onDone,
    onError: (e) => setErreur(erreurMessage(e, 'Impossible de remettre en automatique.')),
  })
  const deplacerOf = useMutation({
    mutationFn: (v: { id: number; idmachine: number; ordre: number[] }) =>
      apiFetch(`/planning-prod-trm/of/${v.id}`, { method: 'PUT', body: JSON.stringify({ idmachine: v.idmachine, ordre: v.ordre }) }),
    onSuccess: () => { onDone(); void qc.invalidateQueries({ queryKey: ['of-trm'] }) },
    onError: (e) => setErreur(erreurMessage(e, 'Déplacement de l’OF impossible.')),
  })
  const reglage = useMutation({
    mutationFn: (v: { regime: RegimeId; horaires: SemaineHoraires | null }) =>
      apiFetch('/planning-prod-trm/reglage', { method: 'PUT', body: JSON.stringify(v) }),
    onSuccess: () => { onDone(); setRegimeOpen(false) },
  })
  const enVol = placerLigne.isPending || deplacerOf.isPending || automatique.isPending

  /** Can this segment be dragged by this user? */
  const deplacable = useCallback((s: PlanSegment) =>
    s.type === 'ligne' ? canLigne : canOf && !s.actif, [canLigne, canOf])

  const compatibles = useCallback((s: PlanSegment): number[] =>
    s.type === 'ligne'
      ? ligneById.get(s.ligneId)?.machines_compatibles ?? []
      : ofById.get(s.id)?.machines_compatibles ?? [], [ligneById, ofById])

  /** Save « seg on métier m, dropped at instant t » (t null = at the end). */
  const deposer = useCallback((seg: PlanSegment, idmachine: number, instant: number | null) => {
    const memeType = (segmentsParMachine.get(idmachine) ?? []).filter((x) =>
      seg.type === 'ligne' ? x.type === 'ligne' : x.type === 'of' && !x.actif)
    const ordre = ordreApresDepot(memeType, seg.id, instant ?? Number.MAX_SAFE_INTEGER)
    if (seg.type === 'ligne') placerLigne.mutate({ id: seg.id, idmachine, ordre })
    else deplacerOf.mutate({ id: seg.id, idmachine, ordre })
  }, [segmentsParMachine, placerLigne, deplacerOf])

  // ── View span ──────────────────────────────────────────
  const maintenant = plan?.maintenant ?? Date.now()
  const vueDe = minuit(maintenant) + decalage * JOUR_MS
  const vueA = vueDe + jours * JOUR_MS
  const [mesurerAxe, { w: axeW }] = useElementSize<HTMLDivElement>()
  const axeRef = useRef<HTMLDivElement | null>(null)
  const refAxe = useCallback((node: HTMLDivElement | null) => { axeRef.current = node; mesurerAxe(node) }, [mesurerAxe])
  const x = useCallback((ms: number) => ((ms - vueDe) / (vueA - vueDe)) * axeW, [vueDe, vueA, axeW])
  const instantDe = useCallback((px: number) => vueDe + (px / Math.max(axeW, 1)) * (vueA - vueDe), [vueDe, vueA, axeW])

  // ── Drag ───────────────────────────────────────────────
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag

  const commencerDrag = (e: React.PointerEvent, seg: PlanSegment) => {
    if (e.button !== 0) return
    if (!deplacable(seg) || enVol) {
      setSelection(cleSegment(seg))
      return
    }
    e.preventDefault()
    setDrag({ seg, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false, machine: seg.idmachine, instant: seg.debut })
  }

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.x0
      const dy = e.clientY - d.y0
      const row = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest('[data-machine-row]')
      const machine = row ? Number(row.getAttribute('data-machine-row')) : null
      const rect = axeRef.current?.getBoundingClientRect()
      const instant = rect ? instantDe(e.clientX - rect.left) : d.instant
      setDrag({ ...d, dx, dy, moved: d.moved || Math.abs(dx) + Math.abs(dy) > 4, machine, instant })
    }
    const up = () => {
      const d = dragRef.current
      setDrag(null)
      if (!d) return
      if (!d.moved) { setSelection(cleSegment(d.seg)); return }
      if (d.machine === null) return
      if (!compatibles(d.seg).includes(d.machine)) {
        setErreur('Ce métier n’est pas réglé pour cette référence (aucun réglage métier sur la fiche écru) : la barre reste où elle était.')
        return
      }
      deposer(d.seg, d.machine, d.instant)
      setSelection(cleSegment(d.seg))
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrag(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', esc)
    }
    // Re-bind only when a drag starts or ends, not on every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])

  const compatiblesDrag = useMemo(() => (drag?.moved ? new Set(compatibles(drag.seg)) : null), [drag?.moved, drag?.seg, compatibles])

  // ── Render ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Calcul du planning…
      </div>
    )
  }
  if (isError || !plan) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Impossible de charger le planning. Vérifiez que l’API est accessible.
      </div>
    )
  }

  const joursVue = joursEntre(vueDe, vueA)
  const pxJour = axeW / jours
  const fermes = fermetures(plan.ouvert, vueDe, vueA)
  const potentielDe = Math.max(plan.reel_jusqua, vueDe)
  const machinesAvecCharge = plan.machines

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Toolbar — §27.2 */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher (n° de commande, client, référence, coloris, OF…)"
            className="h-9 w-full pl-8 pr-3 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {isDesktop && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="outline" size="icon" className="h-9 w-9" title="Reculer" onClick={() => setDecalage((d) => d - Math.round(jours / 2))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setDecalage(0)} disabled={decalage === 0}>
              Aujourd’hui
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" title="Avancer" onClick={() => setDecalage((d) => d + Math.round(jours / 2))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="flex gap-1 ml-2">
              {VUES.map((v) => (
                <button
                  key={v.jours}
                  type="button"
                  onClick={() => setJours(v.jours)}
                  className={cn(
                    'px-2 py-1 text-xs rounded-md transition-colors',
                    jours === v.jours ? 'bg-accent text-accent-foreground shadow-sm font-medium' : 'text-muted-foreground hover:bg-accent/10',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <Button variant="outline" size="sm" className="h-9 flex-shrink-0" onClick={() => setRegimeOpen(true)} title="Régime de travail au-delà du planning des bonnetiers">
          <CalendarClock className="h-3.5 w-3.5 sm:mr-1" />
          <span className="hidden sm:inline">Régime : {REGIME_LIBELLES[plan.reglage.regime]}</span>
        </Button>
      </div>

      {(erreur || enRetard.length > 0 || nonPlanifiables.length > 0) && (
        <div className="flex-shrink-0 flex flex-wrap items-center gap-2 text-xs">
          {erreur && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {erreur}
              <button type="button" onClick={() => setErreur(null)} className="ml-1 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
            </span>
          )}
          {enRetard.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {enRetard.length} commande{enRetard.length > 1 ? 's' : ''} finirai{enRetard.length > 1 ? 'en' : ''}t après le délai :
              {enRetard.map((l) => (
                <button key={l.ligne_id} type="button" data-stock-row onClick={() => setSelection(premiereCle(plan, l))} className="font-semibold underline-offset-2 hover:underline">
                  {l.numero}
                </button>
              ))}
            </span>
          )}
          {nonPlanifiables.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              Aucun métier réglé pour :
              {nonPlanifiables.map((l) => (
                <button key={l.ligne_id} type="button" data-stock-row onClick={() => setSelection(`sans-metier:${l.ligne_id}`)} className="font-semibold underline-offset-2 hover:underline">
                  {l.numero} ({l.reference})
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {isDesktop ? (
        <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border/60 bg-white shadow-sm overflow-hidden select-none">
          {/* Axis */}
          <div className="flex-shrink-0 flex bg-zinc-200/60 border-b border-border/60">
            <div style={{ width: LABEL_W }} className="flex-shrink-0 px-3 py-2 text-xs uppercase tracking-wide font-semibold text-muted-foreground border-r border-border/60">
              Métier
            </div>
            <div ref={refAxe} className="relative flex-1 h-9 overflow-hidden">
              {joursVue.map((j) => {
                const d = new Date(j)
                const lundi = d.getDay() === 1
                const montre = pxJour >= 34 || lundi
                return (
                  <div key={j} className={cn('absolute top-0 bottom-0 border-l', lundi ? 'border-border' : 'border-border/40')} style={{ left: x(j) }}>
                    {montre && (
                      <span className={cn('absolute left-1 top-1 whitespace-nowrap text-[11px] tabular-nums', d.getDay() % 6 === 0 ? 'text-muted-foreground/60' : 'text-muted-foreground')}>
                        {pxJour >= 34
                          ? d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
                          : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    {lundi && pxJour >= 34 && (
                      <span className="absolute left-1 bottom-0.5 whitespace-nowrap text-[10px] text-muted-foreground/70">
                        {d.toLocaleDateString('fr-FR', { month: 'short' })}
                      </span>
                    )}
                  </div>
                )
              })}
              {plan.reel_jusqua > vueDe && plan.reel_jusqua < vueA && (
                <span className="absolute bottom-0.5 text-[10px] font-medium text-primary/80 whitespace-nowrap" style={{ left: x(plan.reel_jusqua) + 4 }}>
                  potentiel {REGIME_LIBELLES[plan.reglage.regime]} →
                </span>
              )}
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-transparent">
            <div className="relative" style={{ height: machinesAvecCharge.length * ROW_H }}>
              {/* Background layer: closed time, potential span, today. */}
              <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: LABEL_W, right: 0 }}>
                {fermes.map((f) => (
                  <div key={f.debut} className="absolute top-0 bottom-0 bg-zinc-100" style={{ left: x(f.debut), width: Math.max(0, x(f.fin) - x(f.debut)) }} />
                ))}
                {potentielDe < vueA && (
                  <div
                    className="absolute top-0 bottom-0"
                    style={{
                      left: x(potentielDe),
                      right: 0,
                      backgroundImage: 'repeating-linear-gradient(135deg, hsl(var(--primary) / 0.05) 0 6px, transparent 6px 12px)',
                    }}
                  />
                )}
                {joursVue.map((j) => (
                  <div key={j} className={cn('absolute top-0 bottom-0 border-l', new Date(j).getDay() === 1 ? 'border-border' : 'border-border/30')} style={{ left: x(j) }} />
                ))}
                {maintenant >= vueDe && maintenant < vueA && (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-accent" style={{ left: x(maintenant) }} title="Maintenant" />
                )}
              </div>

              {machinesAvecCharge.map((m, i) => {
                const segs = segmentsParMachine.get(m.id) ?? []
                const cible = compatiblesDrag !== null
                const ok = compatiblesDrag?.has(m.id) ?? false
                const survol = drag?.moved && drag.machine === m.id
                return (
                  <div
                    key={m.id}
                    data-machine-row={m.id}
                    className={cn(
                      'absolute left-0 right-0 flex border-b border-border/40',
                      cible && ok && 'bg-emerald-500/[0.06]',
                      survol && ok && 'bg-emerald-500/[0.14]',
                      survol && !ok && 'bg-red-500/[0.08]',
                    )}
                    style={{ top: i * ROW_H, height: ROW_H }}
                  >
                    <div
                      style={{ width: LABEL_W }}
                      className={cn(
                        'flex-shrink-0 px-3 flex flex-col justify-center border-r border-border/60 bg-white/90',
                        cible && !ok && 'opacity-40',
                      )}
                    >
                      <span className="text-sm font-semibold leading-tight">{m.label}</span>
                      <span
                        className="text-[11px] text-muted-foreground tabular-nums leading-tight"
                        title={m.rendement_source === 'mesure'
                          ? `Rendement mesuré sur les ${m.rendement_echantillons} derniers OF terminés de ce métier`
                          : 'Pas assez d’OF terminés sur ce métier : rendement médian du parc'}
                      >
                        {Math.round(m.rendement * 100)} %{m.rendement_source === 'mesure' ? '' : ' (parc)'}
                      </span>
                    </div>
                    <div className={cn('relative flex-1', cible && !ok && 'opacity-40')}>
                      {segs.map((s) => {
                        const left = x(s.debut)
                        const right = x(s.fin)
                        if (right < -4 || left > axeW + 4) return null
                        const w = Math.max(6, right - left)
                        const cle = cleSegment(s)
                        const enDrag = drag?.moved && drag.seg.type === s.type && drag.seg.id === s.id
                        return (
                          <BarreSegment
                            key={cle}
                            seg={s}
                            ligne={ligneById.get(s.ligneId)}
                            of={s.type === 'of' ? ofById.get(s.id) : undefined}
                            left={left}
                            width={w}
                            selected={selection === cle}
                            dimmed={!correspond(s)}
                            draggable={deplacable(s)}
                            dragging={!!enDrag}
                            dx={enDrag ? drag!.dx : 0}
                            dy={enDrag ? drag!.dy : 0}
                            onPointerDown={(e) => commencerDrag(e, s)}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex-shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 border-t border-border/60 bg-zinc-200/50 text-[11px] text-muted-foreground">
            <Legende className="bg-primary" label="OF en cours" />
            <Legende className="bg-primary/15 border border-primary/40" label="OF en attente" />
            <Legende className="bg-accent/25 border border-dashed border-accent" label="À lancer (pas encore d’OF)" />
            <Legende className="bg-white border border-border shadow-[inset_3px_0_0_0_rgb(239_68_68)]" label="Finit après le délai" />
            <Legende className="bg-zinc-100 border border-border/60" label="Atelier fermé" />
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-sm border border-border/60" style={{ backgroundImage: 'repeating-linear-gradient(135deg, hsl(var(--primary) / 0.15) 0 3px, transparent 3px 6px)' }} />
              Potentiel ({REGIME_LIBELLES[plan.reglage.regime]}), après le planning des bonnetiers
            </span>
            {(canLigne || canOf) && <span className="ml-auto">Glisser une barre vers un autre métier ou un autre rang pour la déplacer.</span>}
          </div>
        </div>
      ) : (
        <ListeMobile plan={plan} ligneById={ligneById} ofById={ofById} correspond={correspond} onSelect={setSelection} />
      )}

      <PlanningDrawer
        plan={plan}
        selection={selection}
        onClose={() => setSelection(null)}
        embed={embed}
        ligneById={ligneById}
        ofById={ofById}
        canLigne={canLigne}
        canOf={canOf}
        enVol={enVol}
        onMachine={(seg, idmachine) => deposer(seg, idmachine, null)}
        onPlacerLigneSansSegment={(l, idmachine) => {
          const memeType = (segmentsParMachine.get(idmachine) ?? []).filter((x) => x.type === 'ligne').map((x) => x.id)
          placerLigne.mutate({ id: l.ligne_id, idmachine, ordre: [...memeType.filter((id) => id !== l.ligne_id), l.ligne_id] })
        }}
        onAutomatique={(id) => automatique.mutate(id)}
      />

      <RegimeDialog
        open={regimeOpen}
        onOpenChange={(o) => { setRegimeOpen(o); if (!o) reglage.reset() }}
        plan={plan}
        canEdit={canLigne}
        saving={reglage.isPending}
        error={reglage.isError ? erreurMessage(reglage.error, 'Enregistrement impossible.') : null}
        onSave={(regime, horaires) => reglage.mutate({ regime, horaires })}
      />
    </div>
  )
}

/** First segment key of a line (to open the drawer on it), else its line key. */
function premiereCle(plan: Plan, l: PlanLigne): string {
  const s = plan.segments.filter((x) => x.ligneId === l.ligne_id).sort((a, b) => b.fin - a.fin)[0]
  return s ? cleSegment(s) : `sans-metier:${l.ligne_id}`
}

function Legende({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-3 w-5 rounded-sm', className)} />
      {label}
    </span>
  )
}

// ── One bar ──────────────────────────────────────────────

function BarreSegment({
  seg, ligne, of, left, width, selected, dimmed, draggable, dragging, dx, dy, onPointerDown,
}: {
  seg: PlanSegment
  ligne: PlanLigne | undefined
  of: PlanOf | undefined
  left: number
  width: number
  selected: boolean
  dimmed: boolean
  draggable: boolean
  dragging: boolean
  dx: number
  dy: number
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const retard = !!ligne?.en_retard
  const titre = ligne ? `${ligne.numero} · ${ligne.client}` : `OF ${seg.id} · sans commande`
  const ref = ligne ? `${ligne.reference}${ligne.coloris ? ` ${ligne.coloris}` : ''}` : `${of?.reference ?? ''} ${of?.coloris ?? ''}`.trim()
  const detail = `${seg.type === 'of' ? `OF ${seg.id}` : 'À lancer'} · ${Math.round(seg.kg)} kg · ${fmtDuree(seg.minutes)}`
  return (
    <div
      data-stock-row
      onPointerDown={onPointerDown}
      title={`${titre}\n${ref}\n${detail}\n${fmtInstant(seg.debut)} → ${fmtInstant(seg.fin)}${retard ? '\nFinit après le délai' : ''}${seg.approx ? '\nDurée estimée : réglage métier incomplet' : ''}`}
      className={cn(
        'absolute top-1.5 bottom-1.5 rounded-md px-1.5 overflow-hidden flex flex-col justify-center text-[11px] leading-tight transition-shadow',
        seg.type === 'of' && seg.actif && 'bg-primary text-primary-foreground',
        seg.type === 'of' && !seg.actif && 'bg-primary/15 border border-primary/40 text-primary',
        seg.type === 'ligne' && 'bg-accent/25 border border-dashed border-accent text-foreground',
        retard && 'shadow-[inset_3px_0_0_0_rgb(239_68_68)]',
        selected && 'ring-2 ring-accent ring-offset-1 z-10',
        dimmed && 'opacity-25',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        dragging && 'z-20 opacity-80 shadow-lg pointer-events-none',
        seg.approx && 'italic',
      )}
      style={{ left, width, transform: dragging ? `translate(${dx}px, ${dy}px)` : undefined }}
    >
      {width > 40 && (
        <>
          <span className="truncate font-semibold flex items-center gap-1">
            {seg.epingle && <Pin className="h-2.5 w-2.5 flex-shrink-0" />}
            {seg.approx && '≈ '}{titre}
          </span>
          <span className={cn('truncate', seg.type === 'of' && seg.actif ? 'text-white/75' : 'text-muted-foreground')}>
            {ref} · {Math.round(seg.kg)} kg
          </span>
        </>
      )}
    </div>
  )
}

// ── Phone list (§40.2 — the timeline needs a desk) ───────

function ListeMobile({
  plan, ligneById, ofById, correspond, onSelect,
}: {
  plan: Plan
  ligneById: Map<number, PlanLigne>
  ofById: Map<number, PlanOf>
  correspond: (s: PlanSegment) => boolean
  onSelect: (s: Selection) => void
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-3 scrollbar-transparent">
      {plan.machines.map((m) => {
        const segs = plan.segments.filter((s) => s.idmachine === m.id && correspond(s))
        if (segs.length === 0) return null
        return (
          <div key={m.id} className="rounded-lg border border-border/60 bg-white shadow-sm">
            <div className="px-3 py-2 border-b border-border/60 bg-zinc-200/50 flex items-center justify-between">
              <span className="text-sm font-semibold">{m.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">rendement {Math.round(m.rendement * 100)} %</span>
            </div>
            {segs.map((s) => {
              const l = ligneById.get(s.ligneId)
              const o = s.type === 'of' ? ofById.get(s.id) : undefined
              return (
                <button
                  key={cleSegment(s)}
                  type="button"
                  data-stock-row
                  onClick={() => onSelect(cleSegment(s))}
                  className={cn(
                    'w-full text-left px-3 py-2 border-b border-border/40 last:border-b-0',
                    l?.en_retard && 'shadow-[inset_4px_0_0_0_rgb(239_68_68)]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold truncate">{l ? `${l.numero} · ${l.client}` : `OF ${s.id}`}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{s.type === 'of' ? (s.actif ? 'En cours' : `OF ${s.id}`) : 'À lancer'}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {l?.reference ?? o?.reference} · {Math.round(s.kg)} kg · fin {fmtInstant(s.fin)}
                  </div>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Drawer — §27.5 ───────────────────────────────────────

function PlanningDrawer({
  plan, selection, onClose, embed, ligneById, ofById, canLigne, canOf, enVol, onMachine, onPlacerLigneSansSegment, onAutomatique,
}: {
  plan: Plan
  selection: Selection
  onClose: () => void
  embed: boolean
  ligneById: Map<number, PlanLigne>
  ofById: Map<number, PlanOf>
  canLigne: boolean
  canOf: boolean
  enVol: boolean
  onMachine: (seg: PlanSegment, idmachine: number) => void
  onPlacerLigneSansSegment: (l: PlanLigne, idmachine: number) => void
  onAutomatique: (ligneId: number) => void
}) {
  const drawerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selection === null) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      if ((target as Element).closest?.('[data-stock-row]')) return
      // The drawer's PopoverSelect renders its options in a portal on
      // document.body: a click there is not « outside ».
      if (!document.getElementById('root')?.contains(target)) return
      onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !document.querySelector('[data-dialog-root]')) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [selection, onClose])

  const seg = selection && !selection.startsWith('sans-metier:')
    ? plan.segments.find((s) => cleSegment(s) === selection) ?? null
    : null
  const ligneId = seg ? seg.ligneId : selection?.startsWith('sans-metier:') ? Number(selection.slice('sans-metier:'.length)) : 0
  const ligne = ligneById.get(ligneId)
  const of = seg?.type === 'of' ? ofById.get(seg.id) : undefined
  const machineLabel = (id: number) => plan.machines.find((m) => m.id === id)?.label ?? `#${id}`
  const machine = seg ? plan.machines.find((m) => m.id === seg.idmachine) : undefined
  const segsLigne = ligne ? plan.segments.filter((s) => s.ligneId === ligne.ligne_id).sort((a, b) => a.debut - b.debut) : []
  const open = selection !== null && (seg !== null || !!ligne)

  const compat = seg?.type === 'of' ? of?.machines_compatibles ?? [] : ligne?.machines_compatibles ?? []
  const options = compat
    .map((id) => ({ id, primary: machineLabel(id), secondary: `${Math.round((plan.machines.find((m) => m.id === id)?.rendement ?? 0) * 100)} %` }))
    .sort((a, b) => a.primary.localeCompare(b.primary, 'fr', { numeric: true }))
  const peutPlacer = seg ? (seg.type === 'ligne' ? canLigne : canOf && !seg.actif) : canLigne

  return (
    <div
      ref={drawerRef}
      className={cn(
        'fixed right-0 bottom-0 w-full max-w-[440px] bg-white border-l border-border/60 shadow-xl z-30 transition-transform duration-300 flex flex-col',
        embed ? 'top-0' : 'top-14',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      <div className="flex-1 min-h-0 flex flex-col bg-zinc-100/80">
        <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5">
          <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
            <CalendarRange className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground">
                {ligne ? `Commande ${ligne.numero}` : seg ? `OF ${seg.id}` : ''}
              </h2>
              {ligne?.en_retard && (
                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px] py-0">En retard</Badge>
              )}
              {seg?.type === 'of' && seg.actif && (
                <Badge variant="outline" className="rounded-full border border-white/25 bg-white/15 px-1.5 py-0 text-[10px] font-medium text-white">En cours</Badge>
              )}
            </div>
            <p className="text-xs text-white/70 truncate">
              {ligne ? `${ligne.client} · ${ligne.reference}${ligne.coloris ? ` ${ligne.coloris}` : ''}` : `${of?.reference ?? ''} ${of?.coloris ?? ''} · sans commande`}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white" title="Fermer" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scrollbar-transparent">
          {ligne && (
            <DrawerCard icon={<CalendarRange className="h-4 w-4 text-accent" />} title="Commande">
              <div className="space-y-1">
                <KV label="Quantité" value={`${fmtKg(ligne.quantite)} kg`} mono />
                {ligne.reste_a_lancer > 0 && <KV label="Sans OF" value={`${fmtKg(ligne.reste_a_lancer)} kg`} mono />}
                <KV label="Délai" value={fmtDelai(ligne.date_livraison)} />
                <KV
                  label="Fin prévue"
                  value={
                    <span className={cn('font-semibold', ligne.en_retard && 'text-red-600')}>
                      {ligne.non_planifiable ? 'Aucun métier réglé' : fmtInstant(ligne.fin_prevue)}
                    </span>
                  }
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <Link to={`/clients/commandes?commande=${ligne.commande_id}`} className="inline-flex items-center gap-1 text-accent-blue hover:underline">
                  <ExternalLink className="h-3 w-3" /> Ouvrir la commande
                </Link>
              </div>
            </DrawerCard>
          )}

          {segsLigne.length > 0 && (
            <DrawerCard icon={<Factory className="h-4 w-4 text-accent" />} title="Sur le planning">
              <div className="space-y-2">
                {segsLigne.map((s) => (
                  <div key={cleSegment(s)} className={cn('rounded-md border px-2 py-1.5 text-xs', cleSegment(s) === selection ? 'border-accent bg-accent/5' : 'border-border/60')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {machineLabel(s.idmachine)} · {s.type === 'of' ? `OF ${s.id}${s.actif ? ' (en cours)' : ''}` : 'à lancer'}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{fmtKg(s.kg)} kg · {fmtDuree(s.minutes)}</span>
                    </div>
                    <div className="text-muted-foreground tabular-nums">
                      {fmtInstant(s.debut)} → {fmtInstant(s.fin)}
                      {s.approx && ' · durée estimée (réglage métier incomplet)'}
                      {s.horsHorizon && ' · au-delà d’un an'}
                    </div>
                    {s.type === 'of' && (
                      <Link to={`/production/of?of=${s.id}&statut=${s.actif ? 'encours' : 'attente'}`} className="inline-flex items-center gap-1 text-accent-blue hover:underline mt-0.5">
                        <ExternalLink className="h-3 w-3" /> Ouvrir l’OF
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </DrawerCard>
          )}

          {(seg || ligne?.non_planifiable) && (
            <DrawerCard icon={<Pin className="h-4 w-4 text-accent" />} title="Placement">
              {seg?.type === 'of' && seg.actif ? (
                <p className="text-sm text-muted-foreground">L’OF tricote sur {machineLabel(seg.idmachine)} : il ne se déplace pas.</p>
              ) : options.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun métier n’a de réglage pour cette référence (Tombé Métier › Références, réglages métier) : elle ne peut pas être planifiée.
                </p>
              ) : (
                <div className="space-y-2">
                  <KV
                    label="Métier"
                    value={
                      <PopoverSelect
                        size="sm"
                        hideEmpty
                        options={options}
                        value={seg?.idmachine ?? 0}
                        disabled={!peutPlacer || enVol}
                        disabledTitle={seg?.type === 'of' ? 'Demande le droit « Édition des ordres de fabrication »' : 'Demande le droit « Édition du planning de production »'}
                        onChange={(id) => {
                          if (seg && id !== seg.idmachine) onMachine(seg, id)
                          else if (!seg && ligne) onPlacerLigneSansSegment(ligne, id)
                        }}
                      />
                    }
                  />
                  {seg?.type === 'ligne' && (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {seg.epingle ? 'Placée à la main.' : 'Placée automatiquement sur le métier qui la finit le plus tôt.'}
                      </span>
                      {seg.epingle && canLigne && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={enVol} onClick={() => onAutomatique(seg.id)}>
                          <Undo2 className="h-3 w-3 mr-1" /> Automatique
                        </Button>
                      )}
                    </div>
                  )}
                  {seg?.type === 'of' && (
                    <p className="text-xs text-muted-foreground">Changer de métier met l’OF en fin de file du nouveau métier — c’est la file que voit le régleur.</p>
                  )}
                </div>
              )}
            </DrawerCard>
          )}

          {machine && (
            <DrawerCard icon={<Gauge className="h-4 w-4 text-accent" />} title={`Métier ${machine.label}`}>
              <div className="space-y-1">
                <KV label="Rendement" value={`${Math.round(machine.rendement * 100)} %`} mono />
                <p className="text-xs text-muted-foreground">
                  {machine.rendement_source === 'mesure'
                    ? `Mesuré sur les ${machine.rendement_echantillons} derniers OF terminés du métier : temps machine théorique ÷ temps de présence au planning des bonnetiers.`
                    : 'Pas assez d’OF terminés sur ce métier : rendement médian du parc.'}
                  {' '}Durée = tours pour 10 kg (réglage métier) × kg ÷ 10 ÷ vitesse ÷ rendement, posée sur les heures ouvertes.
                </p>
              </div>
            </DrawerCard>
          )}
        </div>
      </div>
    </div>
  )
}

function fmtKg(kg: number): string {
  return kg.toLocaleString('fr-FR', { maximumFractionDigits: kg < 100 ? 1 : 0 })
}

function DrawerCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm text-right truncate', mono && 'tabular-nums')}>{value}</span>
    </div>
  )
}

export default ProductionPlanning
