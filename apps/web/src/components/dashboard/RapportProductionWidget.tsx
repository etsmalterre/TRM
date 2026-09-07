// ── Rapport de production widget ─────────────────────────────
// Port of the legacy FI_Rapport_de_production_période internal window (the
// « Rapport de production » block of the Tricotage Malterre dashboard,
// LIVA #1132): what the visitage weighed over a period, in kg. Backed by
// GET /api/dashboard-trm/rapport-production (ETM API, routes/dashboard-trm.ts —
// the recovered legacy SQL and the deltas live in its header).
//
// The legacy showed ONE number for a free date-time range, narrowed to one
// métier or one reference through a selector and two combos. Here:
//  - the range is a preset (the atelier's shifts, day, week, month —
//    lib/periode-production.ts) with « Personnalisée » keeping the legacy's
//    two free bounds; the resolved bounds are always printed, so a preset
//    never hides what it means;
//  - the total sits in a gold tile, with the roll count and the 2nd-choix
//    share beside it (the visitage's own signal, free once the rows are read);
//  - the split by métier or by reference is a table under the tiles, which is
//    what the legacy made you read one combo pick at a time. A row click
//    filters on it and flips the split to the other axis (a métier → its
//    references, a reference → its métiers); the chip in the split header
//    clears it. Filters compose, unlike the legacy's one-or-the-other.
//
// ── Freshness ──
// Rolls get weighed all day: `refetchOnMount: 'always'` refetches on every
// arrival on the tableau de bord, the header button refetches on demand, and
// the shift presets follow a minute clock so « Équipe en cours » flips at
// 13 h by itself.

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Factory, Inbox, Loader2, RotateCw, X } from 'lucide-react'
import { CardContent } from '@/components/ui/card'
import { PopoverSelect } from '@/components/ui/popover-select'
import { apiFetch } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useElementSize } from '@/hooks/useElementSize'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import {
  PERIODES, bornesPeriode, fmtBorne, toLocalInput, type PeriodeKey,
} from '@/lib/periode-production'
import { WidgetFrame } from './WidgetFrame'

export interface RapportProductionLigne {
  id: number
  label: string
  kg: number
  rouleaux: number
}

export interface RapportProduction {
  du: string
  au: string
  filtres: { machine: number; ref: number }
  total_kg: number
  rouleaux: number
  second_choix_kg: number
  second_choix_rouleaux: number
  par_machine: RapportProductionLigne[]
  par_reference: RapportProductionLigne[]
}

type Axe = 'machine' | 'reference'

const AXE_IDS: Record<Axe, number> = { machine: 1, reference: 2 }
const AXE_OPTIONS = [
  { id: AXE_IDS.machine, primary: 'Par métier', description: 'Un métier par ligne, le plus productif en tête' },
  { id: AXE_IDS.reference, primary: 'Par référence', description: 'Une référence écru par ligne, la plus produite en tête' },
]

const PERIODE_IDS: Record<PeriodeKey, number> = Object.fromEntries(
  PERIODES.map((p, i) => [p.key, i + 1]),
) as Record<PeriodeKey, number>
const PERIODE_OPTIONS = PERIODES.map((p) => ({ id: PERIODE_IDS[p.key], primary: p.label, description: p.description }))
const PERIODE_BY_ID = new Map(PERIODES.map((p) => [PERIODE_IDS[p.key], p.key] as const))

export const RAPPORT_PRODUCTION_QUERY_KEY = ['dashboard-trm', 'rapport-production'] as const

const INPUT = 'h-7 rounded-md border border-input bg-white px-2 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-ring'

export function RapportProductionWidget() {
  const queryClient = useQueryClient()
  const now = useMinuteClock()
  const [periode, setPeriode] = useState<PeriodeKey>('equipe')
  // The free bounds, kept even while a preset is selected so switching to
  // « Personnalisée » restores what the user last typed.
  const [perso, setPerso] = useState(() => {
    const b = bornesPeriode('jour', new Date())
    return { du: b.du, au: b.au }
  })
  const [axe, setAxe] = useState<Axe>('machine')
  const [filtres, setFiltres] = useState<{ machine: number; ref: number }>({ machine: 0, ref: 0 })

  const bornes = useMemo(
    () => (periode === 'perso' ? perso : bornesPeriode(periode, new Date(now))),
    [periode, perso, now],
  )
  const bornesValides = bornes.du !== '' && bornes.au !== '' && bornes.au >= bornes.du

  const query = useQuery<RapportProduction>({
    queryKey: [...RAPPORT_PRODUCTION_QUERY_KEY, bornes.du, bornes.au, filtres.machine, filtres.ref],
    queryFn: () => {
      const q = new URLSearchParams({ du: bornes.du, au: bornes.au })
      if (filtres.machine > 0) q.set('machine', String(filtres.machine))
      if (filtres.ref > 0) q.set('ref', String(filtres.ref))
      return apiFetch(`/dashboard-trm/rapport-production?${q.toString()}`)
    },
    enabled: bornesValides,
    staleTime: 60_000,
    refetchOnMount: 'always',
    placeholderData: (prev) => prev,
  })

  const refreshMut = useMutation({
    mutationFn: async () => {
      await queryClient.invalidateQueries({ queryKey: RAPPORT_PRODUCTION_QUERY_KEY })
    },
  })

  const data = query.data
  const lignes = (axe === 'machine' ? data?.par_machine : data?.par_reference) ?? []
  const total = data?.total_kg ?? 0
  const partSecond = total > 0 && data ? data.second_choix_kg / total : 0

  // The active filters need their labels; the split of the OTHER axis still
  // carries the filtered id as its single row, so the label is in the data.
  const filtreLabels = {
    machine: data?.par_machine.find((l) => l.id === filtres.machine)?.label,
    ref: data?.par_reference.find((l) => l.id === filtres.ref)?.label,
  }

  /** A row click narrows to that métier / reference and shows the other axis. */
  function drill(l: RapportProductionLigne) {
    if (axe === 'machine') {
      setFiltres((f) => ({ ...f, machine: l.id }))
      setAxe('reference')
    } else {
      setFiltres((f) => ({ ...f, ref: l.id }))
      setAxe('machine')
    }
  }

  // Everything below adapts to the WIDGET's width, not the viewport's (the
  // CA widget's rule): three tiles side by side stop reading under ~430px.
  const [bodyRef, bodySize] = useElementSize<HTMLDivElement>()
  const bw = bodySize.w
  const tight = bw > 0 && bw < 430
  const dense = bw >= 430 && bw < 560

  return (
    <WidgetFrame
      icon={Factory}
      title="Rapport de production"
      actions={
        <div className="flex items-center gap-1.5">
          <PopoverSelect
            options={PERIODE_OPTIONS}
            value={PERIODE_IDS[periode]}
            onChange={(id) => setPeriode(PERIODE_BY_ID.get(id) ?? 'equipe')}
            hideEmpty
            size="sm"
            widthClass={tight ? 'w-[132px]' : 'w-[168px]'}
          />
          <button
            type="button"
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending || query.isFetching}
            title="Actualiser"
            className="flex-shrink-0 rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            {query.isFetching
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RotateCw className="h-4 w-4" />}
          </button>
        </div>
      }
    >
      <CardContent ref={bodyRef} className="flex h-full flex-col gap-3 p-3">
        {/* Bounds — the free inputs under « Personnalisée », the resolved
            caption otherwise. Always visible: a preset must say what it means. */}
        {periode === 'perso' ? (
          <div className={cn('flex flex-shrink-0 items-center gap-2', tight && 'flex-wrap')}>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Du
              <input
                type="datetime-local"
                value={perso.du}
                max={perso.au || undefined}
                onChange={(e) => setPerso((p) => ({ ...p, du: e.target.value }))}
                className={INPUT}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              au
              <input
                type="datetime-local"
                value={perso.au}
                min={perso.du || undefined}
                onChange={(e) => setPerso((p) => ({ ...p, au: e.target.value }))}
                className={INPUT}
              />
            </label>
            {!bornesValides && (
              <span className="text-xs text-destructive">Bornes incomplètes ou inversées</span>
            )}
          </div>
        ) : (
          <p className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
            Du <span className="font-medium text-foreground">{fmtBorne(bornes.du, new Date(now))}</span>
            {' '}au <span className="font-medium text-foreground">{fmtBorne(bornes.au, new Date(now))}</span>
          </p>
        )}

        {/* Tiles */}
        <div className={cn('grid flex-shrink-0 gap-2.5', tight ? 'grid-cols-1' : 'grid-cols-3')}>
          <Tile
            label="Produit"
            value={data ? `${fmtNum(data.total_kg, 1)} kg` : '—'}
            sub={data ? `${fmtNum(data.rouleaux)} rouleau${data.rouleaux > 1 ? 'x' : ''}` : undefined}
            strong
            tight={dense}
          />
          <Tile
            label="Par rouleau"
            value={data && data.rouleaux > 0 ? `${fmtNum(data.total_kg / data.rouleaux, 1)} kg` : '—'}
            sub={data ? 'en moyenne' : undefined}
            tight={dense}
          />
          <Tile
            label="2nd choix"
            value={data ? `${fmtNum(data.second_choix_kg, 1)} kg` : '—'}
            sub={data ? `${fmtNum(data.second_choix_rouleaux)} rouleau${data.second_choix_rouleaux > 1 ? 'x' : ''} · ${fmtNum(partSecond * 100, 1)} %` : undefined}
            // Raw amber, not the semantic warning token: a share of déclassé
            // must read the same on every screen (Fils › Stock uses the same
            // ladder — green at 0, amber up to 5 %, red beyond).
            tone={!data || data.second_choix_kg === 0 ? undefined : partSecond > 0.05 ? 'rouge' : 'orange'}
            tight={dense}
          />
        </div>

        {/* Split */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-white">
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-border/60 bg-zinc-200/50 px-2 py-1.5">
            <PopoverSelect
              options={AXE_OPTIONS}
              value={AXE_IDS[axe]}
              onChange={(id) => setAxe(id === AXE_IDS.reference ? 'reference' : 'machine')}
              hideEmpty
              size="sm"
              widthClass="w-[136px]"
            />
            {filtres.machine > 0 && (
              <FiltreChip
                label={`Métier ${filtreLabels.machine ?? ''}`.trim()}
                onClear={() => setFiltres((f) => ({ ...f, machine: 0 }))}
              />
            )}
            {filtres.ref > 0 && (
              <FiltreChip
                label={`Réf. ${filtreLabels.ref ?? ''}`.trim()}
                onClear={() => setFiltres((f) => ({ ...f, ref: 0 }))}
              />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto scrollbar-transparent">
            {query.isLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            )}

            {query.isError && (
              <p className="py-8 text-center text-sm text-destructive">
                Impossible de charger la production de la période.
              </p>
            )}

            {!query.isLoading && !query.isError && bornesValides && lignes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Inbox className="mb-3 h-10 w-10 opacity-40" />
                <p className="text-sm">Rien de pesé sur cette période</p>
              </div>
            )}

            {lignes.length > 0 && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-zinc-200/80 backdrop-blur-sm">
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-1.5 text-left font-semibold">{axe === 'machine' ? 'Métier' : 'Référence'}</th>
                    <th className="px-3 py-1.5 text-right font-semibold whitespace-nowrap">Kg</th>
                    {!tight && <th className="px-3 py-1.5 text-right font-semibold whitespace-nowrap">Rouleaux</th>}
                    <th className={cn('px-3 py-1.5 text-right font-semibold', tight ? 'w-16' : 'w-28')}>Part</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => {
                    const part = total > 0 ? l.kg / total : 0
                    const open = () => drill(l)
                    return (
                      <tr
                        key={l.id}
                        role="button"
                        tabIndex={0}
                        onClick={open}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
                        }}
                        title={axe === 'machine'
                          ? `Voir les références tricotées sur le ${l.label}`
                          : `Voir les métiers qui ont tricoté la ${l.label}`}
                        className="cursor-pointer border-t border-border/40 transition-colors hover:bg-zinc-100/80 focus:outline-none focus-visible:bg-zinc-100/80"
                      >
                        <td className="px-3 py-1.5 font-semibold text-primary">{l.label}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtNum(l.kg, 1)}</td>
                        {!tight && <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmtNum(l.rouleaux)}</td>}
                        <td className="px-3 py-1.5">
                          <div className="flex items-center justify-end gap-2">
                            {!tight && (
                              <div className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-200">
                                <div className="h-full rounded-full bg-gold" style={{ width: `${Math.round(part * 100)}%` }} />
                              </div>
                            )}
                            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{fmtNum(part * 100)} %</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* The rule in one line — the widget's explanation lives in its body,
            never in the header band (§43). */}
        <p className="flex-shrink-0 text-[11px] leading-snug text-muted-foreground">
          Rouleaux pesés au visitage sur la période, 2nd choix compris. Cliquer une ligne pour la détailler.
        </p>
      </CardContent>
    </WidgetFrame>
  )
}

// ── Pieces ────────────────────────────────────────────────────

function Tile({
  label, value, sub, strong, tone, tight,
}: {
  label: string
  value: string
  sub?: string
  strong?: boolean
  tone?: 'orange' | 'rouge'
  tight?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-2.5',
        strong
          ? 'border-gold/30 bg-gradient-to-br from-gold/15 via-gold/[0.06] to-transparent'
          : tone === 'rouge'
            ? 'border-red-500/25 bg-red-500/[0.06]'
            : tone === 'orange'
              ? 'border-amber-500/25 bg-amber-500/[0.06]'
              : 'border-border/60 bg-muted/30',
      )}
    >
      <p className="whitespace-nowrap text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 whitespace-nowrap tabular-nums',
          strong
            ? cn('font-bold', tight ? 'text-lg' : 'text-2xl')
            : cn('font-semibold', tight ? 'text-base' : 'text-xl',
                tone === 'rouge' ? 'text-red-800' : tone === 'orange' ? 'text-amber-800' : 'text-muted-foreground'),
        )}
      >
        {value}
      </p>
      {sub && <p className="truncate text-[11px] tabular-nums text-muted-foreground">{sub}</p>}
    </div>
  )
}

function FiltreChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-accent/30 bg-accent/10 py-0.5 pl-2 pr-1 text-xs font-medium text-primary">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        title="Retirer ce filtre"
        className="rounded p-0.5 text-primary/60 hover:bg-accent/20 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}
