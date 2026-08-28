import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Factory,
  Gauge,
  Hourglass,
  ListChecks,
  Loader2,
  Lock,
  PackageX,
  RotateCw,
  ScanEye,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EventTimeline } from '@/components/shared/PieceEvents'
import { SectionBand } from '@/components/shared/SectionBand'
import { EquipePanel } from '@/components/trs/EquipePanel'
import { KpiTile } from '@/components/trs/KpiTile'
import { PiecesTable, type ColonnePiece } from '@/components/trs/PiecesTable'
import { TimelineMetiers } from '@/components/trs/TimelineMetiers'
import { TrsMetierDialog } from '@/components/trs/TrsMetierDialog'
import { useHasPermission } from '@/contexts/PermissionsContext'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { fmtNum } from '@/lib/format'
import {
  fetchEquipe,
  fmtHeure,
  fmtJourHeure,
  fmtKg,
  fmtPct,
  libelleEquipe,
  trsEquipeKey,
  type MachineEquipe,
  type TrsEquipe,
  type Vue,
  type VueKpi,
} from '@/lib/trs-equipe'
import { cn } from '@/lib/utils'

// Production › TRS — the shift dashboard of the workshop, port of the legacy
// FI_TRS window (its SQL, labels and control inventory recovered from the
// WinDev compile cache on 2026-08-28; the timeline procedure quoted in
// ~/.claude/plans/trs-atelier.md §4). Read-only, behind `view_trs`.
//
// Layout — the read-only dashboard shape of ProductionPrime: a navy hero
// band (◀ ▶ shift navigation, the shift's name and bounds, the parc TRS),
// the four KPI cards as a row of stat tiles, then the body — the bonnetiers
// clocked in on the left (the legacy `SC_Bonnetier`), and on the right ONE
// card that is either the per-métier timeline or, when a KPI tile is
// pressed, that KPI's piece list with the selected piece's event cards
// beside it (the legacy `ONG_Detail` volets). The tile IS the tab.
//
// Everything is computed by the API (ETM `lib/trs-equipe-trm.ts`) in one
// payload per shift — the pieces, their events and the roster included —
// so a tile press or a row click never waits on the network. The current
// shift refetches every minute; a past shift is served from the API's cache
// and kept 10 min here; the previous shift is prefetched so ◀ is instant.

const COLONNES_ROULEAUX: ColonnePiece[] = [
  { key: 'numero', label: 'Numéro', width: '18%' },
  { key: 'poids', label: 'Poids', width: '14%', align: 'right' },
  { key: 'machine', label: 'Machine', width: '14%' },
  { key: 'reference', label: 'Référence', width: '54%' },
]
const COLONNES_PIECES: ColonnePiece[] = [
  { key: 'machine', label: 'Machine', width: '12%' },
  { key: 'numero', label: 'N° pièce', width: '14%' },
  { key: 'poids', label: 'Poids', width: '12%', align: 'right' },
  { key: 'reference', label: 'Référence', width: '26%' },
  { key: 'finMs', label: 'Fin du tricotage', width: '18%' },
  { key: 'visiteeMs', label: 'Visitée le', width: '18%' },
]
const COLONNES_NON_VISITEES: ColonnePiece[] = [
  { key: 'machine', label: 'Machine', width: '15%' },
  { key: 'numero', label: 'N° pièce', width: '20%' },
  { key: 'reference', label: 'Référence', width: '30%' },
  { key: 'finMs', label: 'Fin du tricotage', width: '20%' },
  { key: 'visiteeMs', label: 'Visitée le', width: '15%' },
]

const VUES: Record<VueKpi, { titre: string; colonnes: ColonnePiece[]; vide: string }> = {
  production: { titre: 'Production', colonnes: COLONNES_PIECES, vide: 'Aucune pièce finie sur cette équipe' },
  visitage: { titre: 'Visitage', colonnes: COLONNES_ROULEAUX, vide: 'Aucune pièce visitée sur cette équipe' },
  secondChoix: { titre: 'Second choix', colonnes: COLONNES_ROULEAUX, vide: 'Aucune pièce déclassée sur cette équipe' },
  nonVisitees: { titre: 'Non visitées', colonnes: COLONNES_NON_VISITEES, vide: 'Toutes les pièces de l’équipe ont été visitées' },
}

const STALE_COURANTE_MS = 30_000
const STALE_PASSEE_MS = 10 * 60_000
const POLL_COURANTE_MS = 60_000
/** Silence of the recorder worth an amber caption (the tablet's rule). */
const SILENCE_AMBRE_MS = 3_600_000

export function ProductionTrs() {
  const canView = useHasPermission('view_trs')
  const [searchParams, setSearchParams] = useSearchParams()
  const debut = searchParams.get('debut')
  const [vue, setVue] = useState<Vue>('timeline')
  const [selectedCle, setSelectedCle] = useState<string | null>(null)
  const [infoMachine, setInfoMachine] = useState<MachineEquipe | null>(null)
  const now = useMinuteClock()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, isFetching, refetch } = useQuery<TrsEquipe>({
    queryKey: trsEquipeKey(debut),
    queryFn: () => fetchEquipe(debut),
    placeholderData: keepPreviousData,
    enabled: canView,
    staleTime: debut === null ? STALE_COURANTE_MS : STALE_PASSEE_MS,
    refetchInterval: debut === null ? POLL_COURANTE_MS : false,
    refetchOnWindowFocus: debut === null,
  })

  // ◀ is instant: the previous shift is fetched as soon as this one is known.
  const precedentLit = data?.equipe.precedentLit
  useEffect(() => {
    if (!precedentLit || !canView) return
    void queryClient.prefetchQuery({
      queryKey: trsEquipeKey(precedentLit),
      queryFn: () => fetchEquipe(precedentLit),
      staleTime: STALE_PASSEE_MS,
    })
  }, [precedentLit, canView, queryClient])

  const rows = useMemo(() => (data && vue !== 'timeline' ? data.pieces[vue] : []), [data, vue])
  // Keep a row selected while a list is shown (the first one by default), and
  // drop a selection that the list no longer contains.
  useEffect(() => {
    if (vue === 'timeline') return
    if (rows.length === 0) {
      if (selectedCle !== null) setSelectedCle(null)
      return
    }
    if (!rows.some((r) => r.cle === selectedCle)) setSelectedCle(rows[0].cle)
  }, [rows, vue, selectedCle])

  if (!canView) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Lock className="h-12 w-12 opacity-30" />
        <p className="text-sm font-medium">Accès restreint</p>
        <p className="text-xs max-w-sm text-center">
          Ce tableau de bord nomme les bonnetiers et leurs heures. Demandez la permission « Consulter le TRS de
          l’atelier » à un administrateur.
        </p>
      </div>
    )
  }
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-destructive text-sm">
        <AlertCircle className="h-4 w-4" />
        Erreur de chargement du TRS
      </div>
    )
  }

  const { equipe, kpi, machines, parc } = data
  const debutMs = new Date(equipe.debut).getTime()
  const finMs = new Date(equipe.fin).getTime()
  const aller = (lit: string | null) => {
    setSearchParams(lit ? { debut: lit } : {}, { replace: true })
    setSelectedCle(null)
  }
  const basculer = (v: VueKpi) => setVue((prev) => (prev === v ? 'timeline' : v))
  const dernierMs = data.dernierEvenement ? new Date(data.dernierEvenement).getTime() : null
  const recorderSilencieux = equipe.enCours && dernierMs !== null && now - dernierMs > SILENCE_AMBRE_MS
  const kgH = (v: number | null) => (v === null ? '' : ` · ${fmtNum(v, 1)} kg/h`)

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Hero band — shift navigation + parc TRS (navy, §43 language) */}
      <div className="flex-shrink-0 rounded-lg border-b-2 border-gold bg-primary shadow-sm px-3 sm:px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:bg-white/15 hover:text-white"
            title="Équipe précédente"
            disabled={isFetching}
            onClick={() => aller(equipe.precedentLit)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:bg-white/15 hover:text-white"
            title={equipe.suivantLit ? 'Équipe suivante' : 'Équipe en cours'}
            disabled={equipe.suivantLit === null || isFetching}
            onClick={() => {
              if (!equipe.suivantLit) return
              // Stepping onto the current shift drops the parameter, so the page
              // follows the clock again instead of pinning a literal.
              const suivante = fetchEquipeCouranteLit()
              aller(equipe.suivantLit === suivante ? null : equipe.suivantLit)
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="h-9 w-9 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
          <Gauge className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-lg font-heading font-bold tracking-tight leading-tight text-primary-foreground truncate">
              {libelleEquipe(equipe.nom)}
            </p>
            {equipe.enCours ? (
              <Badge className="bg-white/15 text-white border-transparent text-[10px]">En cours</Badge>
            ) : (
              <Badge className="bg-white/15 text-white/80 border-transparent text-[10px]">Passée</Badge>
            )}
          </div>
          <p className="text-xs text-white/70 tabular-nums">
            Du {fmtJourHeure(equipe.debut)} au {fmtJourHeure(equipe.fin)}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-white/60 leading-none">TRS atelier</p>
            <p className="text-2xl font-heading font-bold leading-tight text-gold">{fmtPct(parc.trs)}</p>
            {dernierMs !== null && (
              <p
                className={cn('text-[10px] leading-none tabular-nums', recorderSilencieux ? 'text-amber-300' : 'text-white/60')}
                title={recorderSilencieux ? 'Aucun événement machine depuis plus d’une heure — automate ou enregistreur silencieux ?' : undefined}
              >
                dernier événement {fmtHeure(dernierMs)}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:bg-white/15 hover:text-white"
            title="Actualiser"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RotateCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* KPI row — four tiles, each a tab onto its list */}
      <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile
          icon={Factory}
          label="Production"
          value={kpi.production.pieces}
          unit={kpi.production.pieces > 1 ? 'pièces' : 'pièce'}
          sub={`${fmtKg(kpi.production.kg)}${kgH(kpi.production.kgParHeure)}`}
          active={vue === 'production'}
          onClick={() => basculer('production')}
          title="Pièces dont le tricotage s’est terminé pendant l’équipe — poids nominal des pièces"
        />
        <KpiTile
          icon={ScanEye}
          label="Visitage"
          value={kpi.visitage.pieces}
          unit={kpi.visitage.pieces > 1 ? 'pièces' : 'pièce'}
          sub={`${fmtKg(kpi.visitage.kg)}${kgH(kpi.visitage.kgParHeure)}`}
          active={vue === 'visitage'}
          onClick={() => basculer('visitage')}
          title="Rouleaux pesés au poste de visitage pendant l’équipe — poids pesé"
        />
        <KpiTile
          icon={PackageX}
          label="Second choix"
          value={kpi.secondChoix.pct === null ? '—' : `${fmtNum(kpi.secondChoix.pct, 2)} %`}
          sub={`${kpi.secondChoix.pieces} pièce${kpi.secondChoix.pieces > 1 ? 's' : ''} · ${fmtKg(kpi.secondChoix.kg)}`}
          valueClass={kpi.secondChoix.pieces > 0 ? 'text-red-700' : undefined}
          active={vue === 'secondChoix'}
          onClick={() => basculer('secondChoix')}
          title="Part en poids des rouleaux déclassés parmi les rouleaux pesés pendant l’équipe"
        />
        <KpiTile
          icon={Hourglass}
          label={`Non visitées à ${kpi.nonVisitees.heureFin}H`}
          value={kpi.nonVisitees.pieces}
          unit={kpi.nonVisitees.pieces > 1 ? 'pièces' : 'pièce'}
          sub={equipe.passee ? 'à la fin de l’équipe' : 'pas encore pesées'}
          valueClass={kpi.nonVisitees.pieces > 0 ? 'text-amber-600' : undefined}
          active={vue === 'nonVisitees'}
          onClick={() => basculer('nonVisitees')}
          title="Pièces finies pendant l’équipe et toujours sans rouleau pesé à la fin de l’équipe"
        />
      </div>

      {/* Body — roster | timeline or list */}
      <div className={cn('flex-1 min-h-0 flex flex-col lg:flex-row gap-3 transition-opacity', isFetching && 'opacity-70')}>
        <EquipePanel
          rows={data.equipeBonnetiers.rows}
          totalS={data.equipeBonnetiers.totalS}
          className="order-2 lg:order-1 lg:w-72 flex-shrink-0 max-h-72 lg:max-h-none"
        />

        <div className="order-1 lg:order-2 flex-1 min-w-0 min-h-[320px] rounded-lg border border-border/60 bg-white shadow-sm flex flex-col overflow-hidden">
          {vue === 'timeline' ? (
            <>
              <SectionBand icon={Activity}>Métiers — {machines.length} en production</SectionBand>
              {machines.length === 0 ? (
                <p className="flex-1 flex items-center justify-center text-sm text-muted-foreground italic">
                  Aucune production sur cette équipe
                </p>
              ) : (
                <TimelineMetiers
                  machines={machines}
                  debutMs={debutMs}
                  finMs={finMs}
                  nowMs={now}
                  enCours={equipe.enCours}
                  onInfo={setInfoMachine}
                />
              )}
            </>
          ) : (
            <>
              <SectionBand
                icon={ListChecks}
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2 text-white/80 hover:bg-white/15 hover:text-white"
                    onClick={() => setVue('timeline')}
                    title="Revenir à la timeline des métiers"
                  >
                    <Activity className="h-4 w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Timeline</span>
                  </Button>
                }
              >
                {VUES[vue].titre} — {rows.length} pièce{rows.length > 1 ? 's' : ''}
              </SectionBand>
              <div className="flex-1 min-h-0 flex flex-col lg:flex-row bg-zinc-100/80">
                <div className="flex-1 min-w-0 min-h-0 flex flex-col p-3">
                  <PiecesTable
                    rows={rows}
                    colonnes={VUES[vue].colonnes}
                    selectedCle={selectedCle}
                    onSelect={setSelectedCle}
                    emptyLabel={VUES[vue].vide}
                  />
                </div>
                {rows.length > 0 && (
                  <div className="lg:w-96 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-border/60 p-3 overflow-y-auto scrollbar-transparent">
                    <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">
                      Événements de la pièce {rows.find((r) => r.cle === selectedCle)?.numero ?? ''}
                    </p>
                    <EventTimeline
                      events={selectedCle ? data.evenements[selectedCle] ?? [] : []}
                      loading={false}
                      emptyLabel={selectedCle ? 'Aucun évènement enregistré sur cette pièce' : 'Sélectionnez une pièce'}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <TrsMetierDialog machine={infoMachine} open={infoMachine !== null} onOpenChange={(o) => !o && setInfoMachine(null)} />
    </div>
  )
}

/** The literal of the shift running now, on the legacy 5 / 13 / 21 grid —
 *  so ▶ onto it clears the URL parameter (see the button). */
function fetchEquipeCouranteLit(): string {
  const d = new Date()
  const h = d.getHours()
  const at = (dayOffset: number, hour: number) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, hour, 0, 0, 0)
    const p = (v: number) => String(v).padStart(2, '0')
    return `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}${p(x.getHours())}0000`
  }
  if (h >= 5 && h < 13) return at(0, 5)
  if (h >= 13 && h < 21) return at(0, 13)
  return h < 5 ? at(-1, 21) : at(0, 21)
}
