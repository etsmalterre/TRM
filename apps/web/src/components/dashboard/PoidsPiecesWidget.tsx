// ── Poids des pièces widget ──────────────────────────────────
// Port of the legacy FI_Mauvais_Compteur internal window (the « Poids des
// pièces » block of the Tricotage Malterre dashboard): one row per OF en
// cours, with the share of its weighed rolls that landed in the tolerance
// band, worst métier first. Backed by GET /api/dashboard-trm/poids-pieces
// (ETM API, routes/dashboard-trm.ts — the recovered legacy SQL and the
// validity rule live in its header).
//
// Row colour = the legacy's three states on `pct` (literals 0.6 / 0.8
// recovered from the WinDev compile cache): red under 60 %, orange under
// 80 %, green from 80 %. The whole row is tinted, as in the legacy — this is
// the widget's one signal and it has to read from across the workshop.
//
// Clicking a row opens the OF's weighing chart (the legacy double-click on
// the table → FEN_Graphe_Compteur). A single click rather than a double:
// nothing else happens on click here, and double-click is invisible on touch.
//
// ── Freshness ──
// The métiers weigh rolls all day, so a cached answer from the morning is
// worse than none: `refetchOnMount: 'always'` refetches on every arrival on
// the tableau de bord (widgets unmount when navigating away), and the header
// button — the legacy's refresh icon — refetches on demand.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Inbox, Loader2, RotateCw, Weight } from 'lucide-react'
import { CardContent } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { WidgetFrame } from './WidgetFrame'
import { PoidsPiecesChartDialog } from './PoidsPiecesChartDialog'

export interface PoidsPiecesRow {
  IDordre_fabrication: number
  /** Métier — `machine.emplacement` (« 3B »), what the workshop calls it. */
  machine: string
  poids_piece: number
  valide: number
  total: number
  /** valide / total, 0..1 */
  pct: number
}

export const POIDS_PIECES_QUERY_KEY = ['dashboard-trm', 'poids-pieces'] as const

/** Legacy thresholds on the share of valid rolls. */
export const PCT_ROUGE = 0.6
export const PCT_ORANGE = 0.8

export type PctTone = 'rouge' | 'orange' | 'vert'

export function pctTone(pct: number): PctTone {
  if (pct < PCT_ROUGE) return 'rouge'
  if (pct < PCT_ORANGE) return 'orange'
  return 'vert'
}

// Raw Tailwind red/amber/emerald rather than the semantic destructive/success
// tokens — same reasoning as the deadline palette (mps_designer §30.4): a
// status colour must read the same on every screen and in every theme.
const TONE_ROW: Record<PctTone, string> = {
  rouge: 'bg-red-500/10 hover:bg-red-500/20 focus-visible:bg-red-500/20',
  orange: 'bg-amber-500/10 hover:bg-amber-500/20 focus-visible:bg-amber-500/20',
  vert: 'bg-emerald-500/10 hover:bg-emerald-500/20 focus-visible:bg-emerald-500/20',
}

/** Explicit utilities, not `.badge-*` helpers — those lose to the Badge's own
 *  `bg-primary` (CLAUDE.md, the badge-warning footgun). */
export const TONE_PILL: Record<PctTone, string> = {
  rouge: 'bg-red-500/15 text-red-800 border-red-500/30',
  orange: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
  vert: 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30',
}

export function PoidsPiecesWidget() {
  const queryClient = useQueryClient()
  const [openId, setOpenId] = useState<number | null>(null)

  const query = useQuery<PoidsPiecesRow[]>({
    queryKey: POIDS_PIECES_QUERY_KEY,
    queryFn: () => apiFetch('/dashboard-trm/poids-pieces'),
    staleTime: 60_000,
    refetchOnMount: 'always',
  })

  const refreshMut = useMutation({
    mutationFn: async () => {
      await queryClient.invalidateQueries({ queryKey: POIDS_PIECES_QUERY_KEY })
    },
  })

  const rows = query.data ?? []

  return (
    <WidgetFrame
      icon={Weight}
      title="Poids des pièces"
      actions={
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
      }
    >
      <CardContent className="flex h-full flex-col p-0">
        <div className="min-h-0 flex-1 overflow-auto scrollbar-transparent">
          {query.isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          )}

          {query.isError && (
            <p className="py-8 text-center text-sm text-destructive">
              Impossible de charger le poids des pièces.
            </p>
          )}

          {!query.isLoading && !query.isError && rows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Inbox className="mb-3 h-12 w-12 opacity-40" />
              <p className="text-sm">Aucun OF en cours avec des pièces pesées</p>
            </div>
          )}

          {rows.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-200/80 backdrop-blur-sm">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Métier</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">N° OF</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Pièces valides</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Nb pièces</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const tone = pctTone(r.pct)
                  const open = () => setOpenId(r.IDordre_fabrication)
                  return (
                    <tr
                      key={r.IDordre_fabrication}
                      role="button"
                      tabIndex={0}
                      onClick={open}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
                      }}
                      title={`Voir les pesées de l’OF ${r.IDordre_fabrication}`}
                      className={cn(
                        'cursor-pointer border-t border-border/40 transition-colors focus:outline-none',
                        TONE_ROW[tone],
                      )}
                    >
                      <td className="px-3 py-2 font-semibold text-primary">{r.machine}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.IDordre_fabrication)}</td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={cn(
                            'inline-flex min-w-[3.25rem] items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                            TONE_PILL[tone],
                          )}
                        >
                          {Math.round(r.pct * 100)} %
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* The rule in one line — the widget's explanation lives in its body,
            never in the header band (§43). */}
        <p className="flex-shrink-0 border-t border-border/60 px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
          Pièce valide : du poids de pièce à +0,7 kg (les chutes ≤ 65 % ne comptent pas).
          Cliquer sur un OF pour voir ses pesées.
        </p>
      </CardContent>

      <PoidsPiecesChartDialog ofId={openId} onClose={() => setOpenId(null)} />
    </WidgetFrame>
  )
}
