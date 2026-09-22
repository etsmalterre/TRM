import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, Loader2, AlertCircle, X, Check, Scale, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PopoverSelect, type PopoverSelectOption } from '@/components/ui/popover-select'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { cn } from '@/lib/utils'
import {
  LIBELLE_TYPE,
  TYPES_JOUR,
  fetchSalariesAdmin,
  fetchSemaine,
  fetchSemaines,
  messageErreur,
  validerSemaine,
  type BilanAnnee,
  type CelluleSemaine,
  type SemaineDetail,
} from '@/lib/pointage-admin'
import { heure, heuresMinutes, jourCourt, jourDe, minutesDepuisHM, soldeSigne } from '@/lib/pointage-heures'
import { DrawerCard, ErreurNote, KV, nomComplet } from '@/components/pointage/parts'

// Pointage › Semaines — port of the WinDev Admin Pointage's FEN_Contrôles (the
// year grid, one cell per ISO week) and FEN_Lissage (one week's seven days),
// plan ~/.claude/plans/admin-pointage.md § 9.2–9.4 (code read on 2026-09-22).
//
// Leticia's weekly routine: on Monday or Tuesday she opens last week (red
// cell = in the validation window and not yet validated), checks the seven
// days and validates. The screen proposes what the legacy proposed — the
// day's gross hours floored to the quarter hour and a type from the first
// start — and she may correct both before validating. A validated week shows
// its stored values and can be validated again (the legacy's HEnregistre).
// The « Détail » balance of the legacy (planned vs done up to last week, the
// yearly adjustments, the total) sits above the grid; it is the tablet's
// « Solde annuel ». Reading needs view_pointage, validating edit_pointage.

const QK = ['pointage-admin'] as const

export function PointageSemaines() {
  const canEdit = useHasPermission('edit_pointage')
  const aujourdhui = useMemo(() => jourDe(Date.now()), [])
  const anneeCourante = +aujourdhui.slice(0, 4)
  const [annee, setAnnee] = useState(anneeCourante)
  const [idSalarie, setIdSalarie] = useState(0)
  const [numero, setNumero] = useState<number | null>(null)

  const { data: salaries } = useQuery({ queryKey: [...QK, 'salaries'], queryFn: fetchSalariesAdmin })
  // The first active salarié opens by default, like the legacy combo.
  useEffect(() => {
    if (idSalarie === 0 && salaries?.length) setIdSalarie(salaries.find((s) => !s.supprime)?.id ?? salaries[0].id)
  }, [salaries, idSalarie])

  const salarieOptions = useMemo<PopoverSelectOption[]>(
    () =>
      [...(salaries ?? [])]
        .sort((a, b) => Number(a.supprime) - Number(b.supprime) || nomComplet(a).localeCompare(nomComplet(b), 'fr'))
        .map((s) => ({ id: s.id, primary: nomComplet(s), secondary: s.supprime ? 'ancien' : undefined })),
    [salaries],
  )
  const anneeOptions = useMemo<PopoverSelectOption[]>(
    () => Array.from({ length: anneeCourante - 2015 }, (_, i) => ({ id: anneeCourante - i, primary: String(anneeCourante - i) })),
    [anneeCourante],
  )

  const semaines = useQuery({
    queryKey: [...QK, 'semaines', idSalarie, annee],
    queryFn: () => fetchSemaines(idSalarie, annee),
    enabled: idSalarie > 0,
  })

  // Drawer dirty tracking (§28): the drawer owns its draft.
  const [drawerDirty, setDrawerDirty] = useState(false)
  const drawerSaveRef = useRef<() => Promise<void>>(async () => {})
  const drawerDiscardRef = useRef<() => void>(() => {})
  const guard = useUnsavedGuard({
    isDirty: drawerDirty,
    save: async () => { await drawerSaveRef.current() },
    onDiscard: () => drawerDiscardRef.current(),
  })
  const handleClose = useCallback(() => guard.guardAction(() => setNumero(null)), [guard.guardAction])
  const handleCellClick = useCallback((n: number) => guard.guardAction(() => setNumero((prev) => (prev === n ? null : n))), [guard.guardAction])
  const changerSalarie = useCallback((id: number) => guard.guardAction(() => { setNumero(null); setIdSalarie(id) }), [guard.guardAction])
  const changerAnnee = useCallback((a: number) => guard.guardAction(() => { setNumero(null); setAnnee(a) }), [guard.guardAction])

  const salarie = salaries?.find((s) => s.id === idSalarie) ?? null
  const data = semaines.data
  const cellule = data?.semaines.find((s) => s.numero === numero) ?? null

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
        <div className="w-64 flex-shrink-0">
          <PopoverSelect options={salarieOptions} value={idSalarie} onChange={changerSalarie} emptyLabel="Choisir un salarié…" />
        </div>
        <div className="w-28 flex-shrink-0">
          <PopoverSelect options={anneeOptions} value={annee} onChange={changerAnnee} hideEmpty />
        </div>
        {data && (
          <p className="text-xs text-muted-foreground">
            Semaines {data.semMin + 1} à {data.semMax} à valider · {data.nbSemaines} semaines dans l’année
          </p>
        )}
      </div>

      {/* Balance — FEN_Contrôles' « Détail », the tablet's « Solde annuel » */}
      {data && <Bilan bilan={data.bilan} />}

      {/* Year grid — FEN_Contrôles' three tables of 18 */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border/60 bg-white shadow-sm overflow-hidden">
        {idSalarie === 0 || semaines.isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : semaines.isError ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive gap-2">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">{(semaines.error as { status?: number })?.status === 403 ? 'Accès restreint : le droit « Consulter le pointage » est nécessaire.' : messageErreur(semaines.error)}</p>
          </div>
        ) : data ? (
          <>
            <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-border/60 bg-zinc-200/60 px-4 py-2">
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Semaines {data.annee}</h2>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-red-500/40 bg-red-500/15" />à valider</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-emerald-500/40 bg-emerald-500/10" />validée</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-border/60 bg-zinc-100" />hors plage</span>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-3">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
                {data.semaines.map((s) => (
                  <CelluleSemaineTile key={s.numero} cellule={s} selected={s.numero === numero} onClick={handleCellClick} />
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <SemaineDrawer
        idSalarie={idSalarie}
        salarieNom={salarie ? nomComplet(salarie) : ''}
        annee={annee}
        numero={numero}
        cellule={cellule}
        canEdit={canEdit}
        onClose={handleClose}
        onDirtyChange={setDrawerDirty}
        saveRef={drawerSaveRef}
        discardRef={drawerDiscardRef}
      />

      <UnsavedChangesDialog open={guard.showDialog} onAction={guard.handleAction} isSaving={guard.isSaving} />
    </div>
  )
}

// ── Balance strip ──────────────────────────────────────

function Bilan({ bilan }: { bilan: BilanAnnee }) {
  const tone = bilan.totalMin > 0 ? 'text-emerald-700' : bilan.totalMin < 0 ? 'text-amber-700' : 'text-foreground'
  return (
    <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-zinc-100/80 shadow-sm px-4 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"><Scale className="h-4 w-4 text-accent" />Jusqu’en semaine {bilan.semaine}</span>
        <span><span className="text-muted-foreground">Prévu </span><span className="font-semibold tabular-nums">{heuresMinutes(bilan.prevuMin)}</span></span>
        <span><span className="text-muted-foreground">Réalisé </span><span className="font-semibold tabular-nums">{heuresMinutes(bilan.realiseMin)}</span></span>
        {bilan.infos.map((i) => (
          <span key={i.id} title="Ajustement de l’année (Variables)"><span className="text-muted-foreground">{i.commentaire || 'Ajustement'} </span><span className="font-semibold tabular-nums">{soldeSigne(i.min)}</span></span>
        ))}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Solde annuel</span>
        <span className={cn('text-base font-bold tabular-nums whitespace-nowrap', tone)}>{soldeSigne(bilan.totalMin)}</span>
      </div>
    </div>
  )
}

// ── Week tile ──────────────────────────────────────────

function CelluleSemaineTile({ cellule, selected, onClick }: { cellule: CelluleSemaine; selected: boolean; onClick: (n: number) => void }) {
  const validee = cellule.cumulMin !== null
  const horsPlage = !validee && !cellule.aValider
  return (
    <button
      type="button"
      data-stock-row
      onClick={() => onClick(cellule.numero)}
      title={`Semaine ${cellule.numero} · du ${jourCourt(cellule.lundi)}`}
      className={cn(
        'rounded-md border px-2 py-1.5 text-left transition-colors',
        cellule.aValider && 'border-red-500/40 bg-red-500/10 hover:bg-red-500/15',
        validee && 'border-emerald-500/30 bg-emerald-500/[0.06] hover:bg-emerald-500/10',
        horsPlage && 'border-border/40 bg-zinc-50 text-muted-foreground/60 hover:bg-zinc-100',
        selected && 'ring-2 ring-accent',
      )}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">S{cellule.numero}</span>
        <span className="text-[10px] text-muted-foreground/70 tabular-nums">{jourCourt(cellule.lundi).slice(-5)}</span>
      </div>
      <div className={cn('text-sm font-semibold tabular-nums', cellule.aValider && 'text-red-800')}>
        {validee ? heuresMinutes(cellule.cumulMin!) : cellule.aValider ? 'à valider' : '—'}
      </div>
    </button>
  )
}

// ── Drawer — FEN_Lissage ───────────────────────────────

interface Draft {
  lisse: string[]
  type: string[]
}
const draftDe = (d: SemaineDetail): Draft => ({ lisse: d.jours.map((j) => heuresMinutes(j.lisseMin)), type: d.jours.map((j) => j.type) })

interface DrawerProps {
  idSalarie: number
  salarieNom: string
  annee: number
  numero: number | null
  cellule: CelluleSemaine | null
  canEdit: boolean
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
  saveRef: React.MutableRefObject<() => Promise<void>>
  discardRef: React.MutableRefObject<() => void>
}

function SemaineDrawer({ idSalarie, salarieNom, annee, numero, cellule, canEdit, onClose, onDirtyChange, saveRef, discardRef }: DrawerProps) {
  const queryClient = useQueryClient()
  const drawerRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const embed = searchParams.get('embed') === 'true'
  const open = numero !== null

  const detail = useQuery({
    queryKey: [...QK, 'semaine', idSalarie, annee, numero],
    queryFn: () => fetchSemaine(idSalarie, annee, numero!),
    enabled: open && idSalarie > 0,
  })
  const [draft, setDraft] = useState<Draft | null>(null)
  const originalRef = useRef<Draft | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [valideeA, setValideeA] = useState<string | null>(null)

  useEffect(() => {
    if (!detail.data) { setDraft(null); originalRef.current = null; return }
    const d = draftDe(detail.data)
    originalRef.current = d
    setDraft(d)
    setErreur(null)
  }, [detail.data])
  useEffect(() => { setValideeA(null) }, [numero, idSalarie, annee])

  const totalMin = useMemo(() => (draft ? draft.lisse.reduce((t, v) => t + (minutesDepuisHM(v) ?? 0), 0) : 0), [draft])
  const isDirty = useMemo(() => {
    if (!draft || !originalRef.current) return false
    return draft.lisse.some((v, i) => v !== originalRef.current!.lisse[i]) || draft.type.some((v, i) => v !== originalRef.current!.type[i])
  }, [draft])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!draft || numero === null) return
      const jours = draft.lisse.map((v, i) => {
        const lisseMin = minutesDepuisHM(v)
        if (lisseMin === null) throw Object.assign(new Error('hm'), { body: { message: `Cumul lissé du ${detail.data?.jours[i].libelle ?? 'jour'} invalide : « ${v} » (attendu HH:MM).` } })
        return { type: draft.type[i], lisseMin }
      })
      return validerSemaine({ idSalarie, annee, numero, jours })
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: [...QK, 'semaines', idSalarie, annee] })
      if (d) queryClient.setQueryData([...QK, 'semaine', idSalarie, annee, numero], d)
      setErreur(null)
      setValideeA(heure(Date.now()))
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty, onDirtyChange])
  useEffect(() => () => { onDirtyChange(false) }, [onDirtyChange])
  useEffect(() => { saveRef.current = async () => { await mutation.mutateAsync() } })
  useEffect(() => { discardRef.current = () => { if (originalRef.current) setDraft(originalRef.current) } })

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      if ((target as Element).closest?.('[data-stock-row]')) return
      if ((target as Element).closest?.('[role="dialog"], [role="alertdialog"], [role="listbox"]')) return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, onClose])

  const typeOptions = useMemo<PopoverSelectOption[]>(() => TYPES_JOUR.map((t, i) => ({ id: i + 1, primary: t, description: LIBELLE_TYPE[t] })), [])
  const d = detail.data
  const etat = cellule?.cumulMin != null ? 'validee' : cellule?.aValider ? 'a_valider' : 'hors_plage'

  return (
    <div
      ref={drawerRef}
      className={cn(
        'fixed right-0 bottom-0 w-full max-w-[520px] bg-white border-l border-border/60 shadow-xl z-30 transition-transform duration-300 flex flex-col',
        embed ? 'top-0' : 'top-14',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      <div className="flex-1 min-h-0 flex flex-col bg-zinc-100/80">
        <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5">
          <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
            <CalendarCheck className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground">Semaine {numero ?? ''}</h2>
              {cellule && (
                <span className={cn('rounded-full border px-1.5 py-0 text-[10px] font-medium whitespace-nowrap text-white', etat === 'a_valider' ? 'border-red-300/60 bg-red-500/40' : etat === 'validee' ? 'border-emerald-300/60 bg-emerald-500/40' : 'border-white/25 bg-white/15')}>
                  {etat === 'a_valider' ? 'À valider' : etat === 'validee' ? 'Validée' : 'Hors plage'}
                </span>
              )}
            </div>
            <p className="text-xs text-white/70 truncate">{d ? `du ${jourCourt(d.lundi)} au ${jourCourt(d.jours[6].jour)} · ${salarieNom}` : salarieNom}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 md:hidden text-white/80 hover:bg-white/15 hover:text-white" onClick={onClose} title="Fermer">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-3 scrollbar-transparent">
          {detail.isLoading || !d || !draft ? (
            open && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            )
          ) : (
            <>
              <ErreurNote message={erreur} />
              {valideeA && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 flex items-center gap-2 text-sm text-emerald-900">
                  <Check className="h-4 w-4 flex-shrink-0" />
                  Semaine validée à {valideeA}.
                </div>
              )}

              <DrawerCard icon={<CalendarCheck className="h-4 w-4 text-accent" />} title="Lissage" highlight={isDirty}>
                <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '19%' }} />
                    <col style={{ width: '31%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '20%' }} />
                  </colgroup>
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="text-left font-semibold pb-1">Jour</th>
                      <th className="text-left font-semibold pb-1">Horaires</th>
                      <th className="text-right font-semibold pb-1">Cumul</th>
                      <th className="text-right font-semibold pb-1">Lissé</th>
                      <th className="text-left font-semibold pb-1 pl-2">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.jours.map((j, i) => (
                      <tr key={j.jour} className="border-t border-border/40 align-top">
                        <td className="py-1.5 pr-1">
                          <div className="font-medium capitalize">{j.libelle}</div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">{jourCourt(j.jour).slice(-5)}</div>
                        </td>
                        <td className="py-1.5 pr-1 text-xs tabular-nums text-muted-foreground">
                          {j.segments.length === 0 ? '—' : j.segments.map((s) => <div key={s.id}>{heure(s.debutMs)} – {heure(s.finMs)}</div>)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{heuresMinutes(j.cumulMin)}</td>
                        <td className="py-1.5 text-right">
                          {canEdit ? (
                            <input
                              type="text"
                              inputMode="numeric"
                              value={draft.lisse[i]}
                              onChange={(e) => setDraft((x) => (x ? { ...x, lisse: x.lisse.map((v, k) => (k === i ? e.target.value : v)) } : x))}
                              className={cn(
                                'h-7 w-16 px-1.5 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right tabular-nums',
                                minutesDepuisHM(draft.lisse[i]) === null ? 'border-red-500/60' : 'border-input',
                              )}
                            />
                          ) : (
                            <span className="tabular-nums font-medium">{draft.lisse[i]}</span>
                          )}
                        </td>
                        <td className="py-1.5 pl-2">
                          {canEdit ? (
                            <PopoverSelect
                              options={typeOptions}
                              value={TYPES_JOUR.indexOf(draft.type[i] as (typeof TYPES_JOUR)[number]) + 1}
                              onChange={(v) => setDraft((x) => (x ? { ...x, type: x.type.map((t, k) => (k === i ? TYPES_JOUR[v - 1] ?? t : t)) } : x))}
                              hideEmpty
                              size="sm"
                              widthClass="w-full"
                              emptyLabel={draft.type[i]}
                            />
                          ) : (
                            <span className="font-mono text-sm">{draft.type[i]}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border/60 bg-zinc-100/80">
                      <td className="py-1.5 font-semibold" colSpan={2}>Total de la semaine</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{heuresMinutes(d.jours.reduce((t, j) => t + j.cumulMin, 0))}</td>
                      <td className="py-1.5 text-right tabular-nums font-bold">{heuresMinutes(totalMin)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  Cumul = heures pointées du jour (fin − début de chaque poste). Lissé proposé = cumul arrondi au quart d’heure inférieur ; type proposé d’après l’heure de la première arrivée. Vous pouvez corriger les deux avant de valider.
                </p>
              </DrawerCard>

              <DrawerCard icon={<Scale className="h-4 w-4 text-accent" />} title="Bilan de la semaine">
                <div className="space-y-1.5">
                  <KV label="Heures pointées" value={heuresMinutes(d.jours.reduce((t, j) => t + j.cumulMin, 0))} mono />
                  <KV label="Heures lissées" value={heuresMinutes(totalMin)} mono />
                  <KV label="Repas jour (M, A, E)" value={String(draft.type.filter((t) => t === 'M' || t === 'A' || t === 'E').length)} mono />
                  <KV label="Repas nuit (N)" value={String(draft.type.filter((t) => t === 'N').length)} mono />
                </div>
              </DrawerCard>

              {canEdit && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-[11px] text-muted-foreground">
                    {d.existe ? 'Semaine déjà validée : valider à nouveau remplace les valeurs enregistrées.' : 'La validation enregistre les sept jours et le total de la semaine.'}
                  </p>
                  <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || draft.lisse.some((v) => minutesDepuisHM(v) === null)}>
                    {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                    {d.existe ? 'Valider à nouveau' : 'Valider la semaine'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
