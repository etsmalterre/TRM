// Meters for Atelier › Maintenance — one ratio against a limit, twice.
//
// `RadialMeter` is the sidebar's entretien gauge (months elapsed / frequency);
// `LinearMeter` is the rouloir counter in the fiche (kg produced / 15 000).
//
// ── Why these are not the legacy needle dials ──────────────────────────────
// The legacy window draws a semicircular dial with a rainbow of ~14 coloured
// segments and a needle. That is three separate dataviz anti-patterns — a
// multi-hue ramp for a magnitude, status carried by colour alone, and (once the
// value overshoots) a needle pinned to the right saying nothing. The `dataviz`
// skill's rule for this exact shape is "a single ratio against a limit →
// **Meter**, same-ramp track", with the severity in the fill and a status
// *label*, never the hue on its own.
//
// So the affordance is kept — it still reads as a jauge, so the workshop
// recognises it — while the encoding is fixed: ONE hue for the track (a light
// step of the fill's own ramp), severity in the fill, the number in the middle,
// and an icon + word for the state. Overshoot is stated in words instead of
// being swallowed by a pinned needle.
//
// Colours are raw Tailwind palette values, not semantic tokens — the same
// theme-stable choice mps_designer §30.4 makes for urgency.

import { AlertTriangle, CheckCircle2, Clock, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MeterEtat = 'ok' | 'proche' | 'due' | 'inconnu'

interface EtatSpec {
  /** Fill of the meter — carries severity. */
  fill: string
  /** Track: a lighter step of the SAME hue, so the state reads across the
   *  whole bar/arc rather than only where the fill reaches. */
  track: string
  label: string
  icon: typeof CheckCircle2
  /** Chip classes. Explicit utilities, never `badge-*` — those lose to the
   *  Badge's own `bg-primary` utility (CLAUDE.md § React rules). */
  chip: string
  text: string
}

const ETATS: Record<MeterEtat, EtatSpec> = {
  ok: {
    fill: '#059669', // emerald-600
    track: '#d1fae5', // emerald-100
    label: 'À jour',
    icon: CheckCircle2,
    chip: 'bg-green-500/15 text-green-700 border-green-500/30',
    text: 'text-green-700',
  },
  proche: {
    fill: '#f59e0b', // amber-500
    track: '#fef3c7', // amber-100
    label: 'Bientôt',
    icon: Clock,
    chip: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
    text: 'text-amber-800',
  },
  due: {
    fill: '#ef4444', // red-500
    track: '#fee2e2', // red-100
    label: 'En retard',
    icon: AlertTriangle,
    chip: 'bg-red-500/15 text-red-700 border-red-500/30',
    text: 'text-red-700',
  },
  inconnu: {
    fill: '#94a3b8', // slate-400
    track: '#e2e8f0', // slate-200
    label: 'Non renseigné',
    icon: HelpCircle,
    chip: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/25',
    text: 'text-muted-foreground',
  },
}

export function etatSpec(etat: MeterEtat): EtatSpec {
  return ETATS[etat] ?? ETATS.inconnu
}

/** Status chip — icon + word. Status is never colour alone (dataviz rule). */
export function EtatChip({ etat, className }: { etat: MeterEtat; className?: string }) {
  const spec = etatSpec(etat)
  const Icon = spec.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        spec.chip,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {spec.label}
    </span>
  )
}

// ── Radial meter ──────────────────────────────────────────

/** Point on the meter's arc. The arc spans 240°, opening downward: -210° (SW)
 *  to +30° (SE), 0° being straight up. */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const [x1, y1] = polar(cx, cy, r, fromDeg)
  const [x2, y2] = polar(cx, cy, r, toDeg)
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

const START = -120
const SWEEP = 240

/**
 * A ratio against a limit, drawn as an arc. `ratio` is unbounded — the fill
 * clamps at the end of the arc but the caller states the real figure in text,
 * which is what the legacy needle failed to do.
 */
export function RadialMeter({
  ratio,
  etat,
  center,
  caption,
  size = 132,
}: {
  ratio: number | null
  etat: MeterEtat
  /** Big value in the middle of the arc (e.g. "10 mois"). */
  center: string
  /** Small line under it (e.g. "sur 3 mois"). */
  caption?: string
  size?: number
}) {
  const spec = etatSpec(etat)
  const cx = size / 2
  const cy = size / 2
  // Thin marks (dataviz mark specs) — a fat ring reads as decoration and
  // crowds the value sitting inside it.
  const stroke = Math.max(5, Math.round(size * 0.07))
  const r = cx - stroke / 2 - 1
  const clamped = ratio === null ? 0 : Math.max(0, Math.min(1, ratio))
  const end = START + SWEEP * clamped

  return (
    <svg
      viewBox={`0 0 ${size} ${size * 0.8}`}
      width={size}
      height={size * 0.8}
      role="img"
      aria-label={`${center}${caption ? ` ${caption}` : ''} — ${spec.label}`}
      className="flex-shrink-0 overflow-visible"
    >
      {/* Track — a light step of the fill's own ramp, never neutral grey, so
          the state reads across the whole arc. */}
      <path
        d={arcPath(cx, cy, r, START, START + SWEEP)}
        fill="none"
        stroke={spec.track}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {clamped > 0 && (
        <path
          d={arcPath(cx, cy, r, START, end)}
          fill="none"
          stroke={spec.fill}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      )}
      {/* Proportional figures, not tabular: this is a standalone display value,
          not a column (dataviz mark specs). */}
      <text
        x={cx}
        y={caption ? cy + 3 : cy + 8}
        textAnchor="middle"
        className="fill-foreground"
        style={{ fontSize: size * 0.3, fontWeight: 700 }}
      >
        {center}
      </text>
      {caption && (
        <text
          x={cx}
          y={cy + size * 0.21}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: size * 0.115 }}
        >
          {caption}
        </text>
      )}
    </svg>
  )
}

// ── Linear meter ──────────────────────────────────────────

/**
 * The rouloir counter: kg produced against the 15 000 Kg service interval.
 * Same encoding rules as the radial one — single-hue track, severity fill,
 * figures in text beside it.
 */
export function LinearMeter({
  ratio,
  etat,
  className,
}: {
  ratio: number
  etat: MeterEtat
  className?: string
}) {
  const spec = etatSpec(etat)
  const pct = Math.max(0, Math.min(1, ratio)) * 100
  return (
    <div
      className={cn('h-2.5 w-full rounded-full overflow-hidden', className)}
      style={{ backgroundColor: spec.track }}
      role="meter"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, backgroundColor: spec.fill }}
      />
    </div>
  )
}
