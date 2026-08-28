import type { ComponentType, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** One of the four KPI cards of Production › TRS. A stat tile that is ALSO
 *  a tab: pressing it swaps the body for the card's piece list (the legacy
 *  `BTN_Detail` chevron); pressing it again returns to the timeline. The
 *  active tile wears the app's selection (gold edge + ring), the chevron
 *  turns — the tile is the whole affordance, no separate button. */
export function KpiTile({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  active,
  onClick,
  valueClass,
  title,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  active: boolean
  onClick: () => void
  /** Status colour of the figure, when it carries one (2ᵉ choix). */
  valueClass?: string
  /** The basis of the figure — what is summed, and how. */
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        'text-left rounded-lg border bg-card shadow-sm p-3 flex items-start gap-3 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-gold ring-1 ring-gold bg-gold/[0.04]' : 'border-border/60 hover:border-zinc-400/60',
      )}
    >
      <div
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
          active ? 'bg-gold text-gold-foreground' : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <p className={cn('text-2xl font-heading font-bold leading-tight whitespace-nowrap', valueClass)}>
          {value}
          {unit && <span className="text-sm font-normal text-muted-foreground"> {unit}</span>}
        </p>
        {sub !== undefined && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
      </div>
      <ChevronDown
        className={cn('h-4 w-4 flex-shrink-0 mt-1 text-muted-foreground transition-transform', active && 'rotate-180')}
      />
    </button>
  )
}
