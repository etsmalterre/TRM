// ── Pesées d'un OF — the chart behind a « Poids des pièces » row ─────────
// Port of the legacy FEN_Graphe_Compteur window (« 3B - OF N° 3554 »): every
// weighed roll of the OF in weighing order, the target weight as a dashed
// line, the tolerance band [poids_piece, poids_piece + 0,7 kg] left clear
// and everything outside it tinted red. Backed by
// GET /api/dashboard-trm/poids-pieces/:id.
//
// Hand-rolled SVG like every ETM dashboard chart (no chart library in either
// app), drawn at real pixel size via useElementSize. Departures from the
// legacy, on purpose:
//  - the Y axis covers poids_piece ± 2 kg like the legacy and stretches up
//    to ± 4 kg to fit outliers; beyond that a point is PINNED to the axis
//    edge as a triangle (true weight in the tooltip) rather than letting a
//    3 kg remnant squash the 0,7 kg band into a hairline — the band is the
//    question this chart answers, so it stays readable;
//  - the remnant zone (≤ 65 % of the target, where a short piece still counts
//    as valid) is drawn in grey when the axis reaches it, so a short piece
//    sitting in the red doesn't read as an error;
//  - the X axis is the weighing sequence (1…n); the piece number is in the
//    tooltip — cut pieces are numbered 1001+ and interleave, which made the
//    legacy's unlabelled axis the better choice over labelling by number;
//  - points are coloured by validity and carry a hover tooltip (dataviz:
//    a chart that is interactive ships its hover layer).

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Weight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import { useElementSize } from '@/hooks/useElementSize'
import { cn } from '@/lib/utils'
import { pctTone, TONE_PILL } from './PoidsPiecesWidget'

interface PoidsPiece {
  IDstock_ecru: number
  numero: string
  num_piece_OF: number
  poids: number
  date_saisie: string | null
  valide: boolean
}

interface PoidsPiecesDetail {
  IDordre_fabrication: number
  machine: string
  poids_piece: number
  poids_min: number
  poids_max: number
  chute_max: number
  pieces: PoidsPiece[]
}

// Series colours: the app's accent blue for the line and valid points (the
// single-series default of the ETM charts), raw red-500 for a point outside
// the band — the same red as the widget's rows, so the two views agree.
const LINE = '#3B7DC9'
const INVALID = '#EF4444'
const TARGET = '#16A34A'
const BAND_FILL = 'rgb(239 68 68 / 0.10)'
const CHUTE_FILL = 'rgb(113 113 122 / 0.12)'

const CHART_HEIGHT = 340
const MARGIN = { top: 14, right: 16, bottom: 30, left: 48 }
/** The axis always shows target ± this (legacy: ± 2). */
const AXIS_MIN_HALF_SPAN = 2
/** …and never more than target ± this — outliers beyond are pinned. */
const AXIS_MAX_HALF_SPAN = 4

/** HFSQL DATETIME text (`2026-07-30 18:48:54.123`) → « 30/07/2026 18:48». */
function fmtDateTime(value: string | null): string {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value)
  if (!m) return value
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`
}

export function PoidsPiecesChartDialog({
  ofId, onClose,
}: {
  ofId: number | null
  onClose: () => void
}) {
  const open = ofId !== null
  const query = useQuery<PoidsPiecesDetail>({
    queryKey: ['dashboard-trm', 'poids-pieces', ofId],
    queryFn: () => apiFetch(`/dashboard-trm/poids-pieces/${ofId}`),
    enabled: open,
    staleTime: 60_000,
  })
  const d = query.data

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-4xl" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Weight className="h-5 w-5 text-accent" />
            {/* The legacy window title, verbatim shape: « 3B - OF N° 3554 » */}
            {d ? `${d.machine} — OF n° ${d.IDordre_fabrication}` : 'Pesées de l’OF'}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-3">
          {query.isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
          )}
          {query.isError && (
            <p className="py-12 text-center text-sm text-destructive">
              Impossible de charger les pesées de cet OF.
            </p>
          )}
          {d && d.pieces.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucune pièce pesée sur cet OF.
            </p>
          )}
          {d && d.pieces.length > 0 && <PoidsChart detail={d} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PoidsChart({ detail }: { detail: PoidsPiecesDetail }) {
  const [plotRef, plot] = useElementSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const { pieces, poids_piece: target, poids_max: bandTop, chute_max: chuteMax } = detail

  const valides = pieces.filter((p) => p.valide).length
  const pct = valides / pieces.length
  const tone = pctTone(pct)

  // Y domain: the legacy's target ± 2 kg, stretched (up to ± 4) to what the
  // data needs, snapped to the tick step so the axis reads as round numbers.
  const scale = useMemo(() => {
    const values = pieces.map((p) => p.poids)
    const rawLo = Math.max(target - AXIS_MAX_HALF_SPAN, Math.min(target - AXIS_MIN_HALF_SPAN, ...values))
    const rawHi = Math.min(target + AXIS_MAX_HALF_SPAN, Math.max(target + AXIS_MIN_HALF_SPAN, ...values))
    const step = rawHi - rawLo <= 6 ? 0.5 : 1
    const lo = Math.max(0, Math.floor((rawLo - step * 0.2) / step) * step)
    const hi = Math.ceil((rawHi + step * 0.2) / step) * step
    const ticks: number[] = []
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100)
    return { lo, hi, ticks }
  }, [pieces, target])

  const w = plot.w
  const h = CHART_HEIGHT
  const plotW = Math.max(0, w - MARGIN.left - MARGIN.right)
  const plotH = h - MARGIN.top - MARGIN.bottom
  const n = pieces.length
  const x = (i: number) => MARGIN.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  // Clamped to the plot: a value past the axis lands on its edge (see header).
  const y = (v: number) => {
    const clamped = Math.min(scale.hi, Math.max(scale.lo, v))
    return MARGIN.top + plotH - ((clamped - scale.lo) / (scale.hi - scale.lo)) * plotH
  }
  const pinned = (v: number): 'up' | 'down' | null =>
    v > scale.hi ? 'up' : v < scale.lo ? 'down' : null

  // Label every k-th piece so the axis never crowds (≈ 60 px per label).
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 60))))

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (n === 0 || plotW <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left - MARGIN.left
    const idx = n > 1 ? Math.round((px / plotW) * (n - 1)) : 0
    setHover(Math.min(n - 1, Math.max(0, idx)))
  }

  const hovered = hover !== null ? pieces[hover] : null
  const showChute = scale.lo < chuteMax

  return (
    <div className="space-y-3">
      {/* The figure the row already gave, restated next to its evidence. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 font-semibold tabular-nums', TONE_PILL[tone])}>
          {Math.round(pct * 100)} %
        </span>
        <span className="tabular-nums">
          <span className="font-semibold">{valides}</span> / {n} pièce{n > 1 ? 's' : ''} valide{valides > 1 ? 's' : ''}
        </span>
        <span className="text-muted-foreground">
          Cible {fmtNum(target, 1)} kg · tolérance +0,7 kg
        </span>
      </div>

      <div ref={plotRef} className="relative w-full select-none" style={{ height: h }}>
        {w > 0 && (
          <svg
            width={w}
            height={h}
            className="block"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            {/* Out-of-tolerance zones — above the band and below the target */}
            <rect x={MARGIN.left} y={MARGIN.top} width={plotW} height={Math.max(0, y(bandTop) - MARGIN.top)} fill={BAND_FILL} />
            <rect x={MARGIN.left} y={y(target)} width={plotW} height={Math.max(0, MARGIN.top + plotH - y(target))} fill={BAND_FILL} />
            {/* Remnant zone: short pieces down here still count as valid */}
            {showChute && (
              <rect x={MARGIN.left} y={y(chuteMax)} width={plotW} height={Math.max(0, MARGIN.top + plotH - y(chuteMax))} fill={CHUTE_FILL} />
            )}

            {/* Grid + Y axis */}
            {scale.ticks.map((t) => (
              <g key={t}>
                <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
                <text x={MARGIN.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[11px] tabular-nums">
                  {fmtNum(t, 1)}
                </text>
              </g>
            ))}

            {/* Band edges: dashed green target, thin red ceiling */}
            <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(target)} y2={y(target)} stroke={TARGET} strokeWidth={1.5} strokeDasharray="6 4" />
            <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(bandTop)} y2={y(bandTop)} stroke={INVALID} strokeWidth={1} strokeOpacity={0.6} />

            {/* X axis labels: weighing sequence */}
            {pieces.map((p, i) => (
              i % labelEvery === 0 || i === n - 1 ? (
                <text key={p.IDstock_ecru} x={x(i)} y={h - 10} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular-nums">
                  {i + 1}
                </text>
              ) : null
            ))}

            {/* Crosshair */}
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={MARGIN.top + plotH} className="stroke-muted-foreground/50" strokeWidth={1} strokeDasharray="3 3" />
            )}

            {/* Series */}
            {n > 1 && (
              <polyline
                points={pieces.map((p, i) => `${x(i)},${y(p.poids)}`).join(' ')}
                fill="none"
                stroke={LINE}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {pieces.map((p, i) => {
              const pin = pinned(p.poids)
              const fill = p.valide ? LINE : INVALID
              const r = hover === i ? 6 : 4
              if (pin) {
                // Off the axis: a triangle pointing where the value went.
                const cx = x(i)
                const cy = y(p.poids)
                const s = r + 2
                const pts = pin === 'up'
                  ? `${cx},${cy - s} ${cx - s},${cy + s} ${cx + s},${cy + s}`
                  : `${cx},${cy + s} ${cx - s},${cy - s} ${cx + s},${cy - s}`
                return <polygon key={p.IDstock_ecru} points={pts} fill={fill} stroke="white" strokeWidth={1.5} />
              }
              return (
                <circle
                  key={p.IDstock_ecru}
                  cx={x(i)}
                  cy={y(p.poids)}
                  r={r}
                  fill={fill}
                  stroke="white"
                  strokeWidth={1.5}
                />
              )
            })}
          </svg>
        )}

        {hovered && hover !== null && w > 0 && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: Math.min(Math.max(0, x(hover) - 70), Math.max(0, w - 150)),
              top: Math.max(0, y(hovered.poids) - 64),
            }}
          >
            <p className="font-semibold">
              Pièce {hovered.num_piece_OF || hover + 1}
              {hovered.numero && <span className="font-normal text-muted-foreground"> · {hovered.numero}</span>}
              <span className="font-normal text-muted-foreground"> · {hover + 1}ᵉ pesée</span>
            </p>
            <p className="tabular-nums">
              <span className="font-semibold">{fmtNum(hovered.poids, 2)} kg</span>
              <span className="text-muted-foreground">
                {' '}({hovered.poids >= target ? '+' : '−'}{fmtNum(Math.abs(hovered.poids - target), 2)})
              </span>
            </p>
            <p className={hovered.valide ? 'text-emerald-700' : 'text-red-700'}>
              {hovered.valide ? 'Valide' : 'Hors tolérance'}
            </p>
            {hovered.date_saisie && (
              <p className="text-muted-foreground">{fmtDateTime(hovered.date_saisie)}</p>
            )}
          </div>
        )}
      </div>

      {/* Legend — identity is never colour alone */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: LINE }} />
          Pièce valide
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: INVALID }} />
          Hors tolérance
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: TARGET }} />
          Cible {fmtNum(target, 1)} kg
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: BAND_FILL }} />
          Hors bande [{fmtNum(target, 1)} ; {fmtNum(bandTop, 1)}] kg
        </span>
        {showChute && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: CHUTE_FILL }} />
            Chute ≤ {fmtNum(chuteMax, 1)} kg (valide)
          </span>
        )}
        {pieces.some((p) => pinned(p.poids)) && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="10" aria-hidden><polygon points="6,0 0,10 12,10" fill="currentColor" /></svg>
            Hors axe ({fmtNum(scale.lo, 1)}–{fmtNum(scale.hi, 1)} kg) — poids réel au survol
          </span>
        )}
      </div>
    </div>
  )
}
