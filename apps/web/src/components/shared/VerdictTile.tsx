// One stat tile of a « bilan » dialog (mps_designer §18.D) — a §7 status
// card whose big figure carries the verdict colour. Shared by Fils › Stock
// (Archivage) and Clients › Commandes (Solder).
import { cn } from '@/lib/utils'

export type VerdictTone = 'success' | 'warning' | 'danger' | 'neutral'

const VERDICT_TONE: Record<VerdictTone, { border: string; iconBg: string; icon: string; value: string }> = {
  success: { border: 'border-l-green-500/60', iconBg: 'bg-green-500/10', icon: 'text-green-600', value: 'text-green-600' },
  warning: { border: 'border-l-amber-400/60', iconBg: 'bg-amber-400/10', icon: 'text-amber-600', value: 'text-amber-600' },
  danger: { border: 'border-l-destructive/60', iconBg: 'bg-destructive/10', icon: 'text-destructive/70', value: 'text-destructive' },
  neutral: { border: 'border-l-border', iconBg: 'bg-muted', icon: 'text-muted-foreground', value: 'text-foreground' },
}

/** One stat tile of the Archivage bilan — status-colored card (§7) with the
 *  big figure carrying the verdict color. */
export function VerdictTile({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  tone: VerdictTone
}) {
  const t = VERDICT_TONE[tone]
  return (
    <div className={cn('rounded-lg border-l-4 border border-border/60 bg-card p-3 shadow-sm', t.border)}>
      <div className="flex items-center gap-2">
        <div className={cn('h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0', t.iconBg, t.icon)}>
          {icon}
        </div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className={cn('mt-2 text-2xl font-bold tabular-nums leading-none', t.value)}>{value}</p>
      <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">{detail}</p>
    </div>
  )
}
