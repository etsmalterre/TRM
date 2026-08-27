// ── Pièces à visiter widget ──────────────────────────────────
// Port of the legacy FI_PiecesAVisiter internal window (the « Pièces a
// visiter » block of the Tricotage Malterre dashboard): every piece that came
// off a métier in the last 24 hours and that nobody has weighed yet, oldest
// first. Backed by GET /api/dashboard-trm/pieces-a-visiter (ETM API,
// routes/dashboard-trm.ts — the recovered legacy SQL, the équipe rule and the
// parity evidence live in its header).
//
// Row colour = the legacy's three states on the WAITING TIME, from the
// WLanguage that fills the table (recovered verbatim, 2026-08-27):
//
//   dhDateRouge  = DateHeureSys() ; dhDateRouge.Heure  -= 3
//   dhDateOrange = DateHeureSys() ; dhDateOrange.Heure -= 2
//   si date_fin < dhDateRouge → RougePastel ; sinon si < dhDateOrange →
//   OrangePastel ; sinon → VertPastel
//
// The whole row is tinted, as in the legacy — this is the widget's one signal
// and it has to read from across the workshop. Same tints and the same pill
// treatment as « Poids des pièces », so the two dashboard tables read as one
// system.
//
// ── Deliberate deltas vs the legacy ──
//  - An « Attente » column. The legacy paints the row and leaves the reader to
//    subtract two clock times to find out why; the colour has to be legible as
//    a number, and it is also what ranks the rows.
//  - The tone is computed in the BROWSER against a clock that ticks every
//    minute, exactly as the legacy computes it against DateHeureSys() — but
//    without freezing at the moment of the fetch. A row goes amber then red
//    while you watch it, which is the point of a wall-board widget.
//  - Read-only, like the legacy (user decision, 2026-08-27): no click-through
//    to Production › Visitage. The widget reports, the poste saisit.
//
// ── Freshness ──
// Pieces come off the métiers all day, so a cached answer from the morning is
// worse than none: `refetchOnMount: 'always'` refetches on every arrival on
// the tableau de bord (widgets unmount when navigating away), and the header
// button — the legacy's refresh icon — refetches on demand.

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, PackageCheck, RotateCw, ScanEye } from 'lucide-react'
import { CardContent } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { WidgetFrame } from './WidgetFrame'

export type Equipe = 'Matin' | 'Après-Midi' | 'Nuit'

export interface PieceAVisiterRow {
  IDpiece_production: number
  IDordre_fabrication: number
  /** Métier — `machine.emplacement` (« 3B »), what the workshop calls it. */
  machine: string
  /** `piece_production.numero` — the piece's rank inside its OF. */
  numero: number
  /** End of knitting, epoch ms. */
  date_fin_ms: number
  equipe: Equipe
}

export const PIECES_A_VISITER_QUERY_KEY = ['dashboard-trm', 'pieces-a-visiter'] as const

/** Legacy thresholds, in hours of waiting (`dhDateRouge` / `dhDateOrange`). */
export const ATTENTE_ROUGE_H = 3
export const ATTENTE_ORANGE_H = 2

export type AttenteTone = 'rouge' | 'orange' | 'vert'

/** The legacy ladder, restated on the elapsed time rather than on two absolute
 *  DateHeure values — same boundaries, and `<` on the threshold date is `>=`
 *  on the elapsed hours. */
export function attenteTone(attenteMs: number): AttenteTone {
  const h = attenteMs / 3_600_000
  if (h >= ATTENTE_ROUGE_H) return 'rouge'
  if (h >= ATTENTE_ORANGE_H) return 'orange'
  return 'vert'
}

/** « 3 h 19 » / « 47 min » — the waiting time, at the precision that matters.
 *  Never a bare decimal of hours: the visiteuse reads this as a clock. */
export function fmtAttente(attenteMs: number): string {
  const min = Math.max(0, Math.floor(attenteMs / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')}`
}

/** « 27/08/2026 06:16 » — the legacy's « fin du tricotage » column. The seconds
 *  it printed are dropped: nothing on this screen is decided to the second. */
export function fmtFinTricotage(ms: number): string {
  const d = new Date(ms)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** A clock that ticks once a minute, so the colours advance on their own
 *  between two fetches — a piece crosses 2 h and the row turns amber without
 *  anyone touching the page. One interval for the whole widget. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

// Raw Tailwind red/amber/emerald rather than the semantic destructive/success
// tokens — same reasoning as the deadline palette (mps_designer §30.4) and as
// the sibling widget: a status colour must read the same on every screen.
const TONE_ROW: Record<AttenteTone, string> = {
  rouge: 'bg-red-500/10',
  orange: 'bg-amber-500/10',
  vert: 'bg-emerald-500/10',
}

/** Explicit utilities, not `.badge-*` helpers — those lose to the Badge's own
 *  `bg-primary` (CLAUDE.md, the badge-warning footgun). */
const TONE_PILL: Record<AttenteTone, string> = {
  rouge: 'bg-red-500/15 text-red-800 border-red-500/30',
  orange: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
  vert: 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30',
}

export function PiecesAVisiterWidget() {
  const queryClient = useQueryClient()
  const now = useMinuteClock()

  const query = useQuery<PieceAVisiterRow[]>({
    queryKey: PIECES_A_VISITER_QUERY_KEY,
    queryFn: () => apiFetch('/dashboard-trm/pieces-a-visiter'),
    staleTime: 60_000,
    refetchOnMount: 'always',
  })

  const refreshMut = useMutation({
    mutationFn: async () => {
      await queryClient.invalidateQueries({ queryKey: PIECES_A_VISITER_QUERY_KEY })
    },
  })

  const rows = query.data ?? []

  return (
    <WidgetFrame
      icon={ScanEye}
      title="Pièces à visiter"
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
              Impossible de charger les pièces à visiter.
            </p>
          )}

          {/* Empty is the GOOD state here — everything that came off a métier
              has been weighed. Say so, rather than borrowing the neutral
              "aucune donnée" inbox of a list that should have had rows. */}
          {!query.isLoading && !query.isError && rows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <PackageCheck className="mb-3 h-12 w-12 text-emerald-600/40" />
              <p className="text-sm">Aucune pièce en attente de visitage</p>
            </div>
          )}

          {rows.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-200/80 backdrop-blur-sm">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Métier</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">N° pièce</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Fin du tricotage</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Attente</th>
                  <th className="px-3 py-2 text-right font-semibold">Équipe</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const attente = Math.max(0, now - r.date_fin_ms)
                  const tone = attenteTone(attente)
                  return (
                    <tr
                      key={r.IDpiece_production}
                      className={cn('border-t border-border/40', TONE_ROW[tone])}
                    >
                      <td className="px-3 py-2 font-semibold text-primary">{r.machine}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.numero)}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                        {fmtFinTricotage(r.date_fin_ms)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={cn(
                            'inline-flex min-w-[3.75rem] items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                            TONE_PILL[tone],
                          )}
                        >
                          {fmtAttente(attente)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{r.equipe}</td>
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
          Pièces sorties d’un métier depuis moins de 24 h et pas encore pesées.
          Orange au-delà de 2 h d’attente, rouge au-delà de 3 h.
        </p>
      </CardContent>
    </WidgetFrame>
  )
}
