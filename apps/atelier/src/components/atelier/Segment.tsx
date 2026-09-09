// A two-segment control's half: which list, which tab. Not a §29.3 pill —
// that pattern is for a mode that changes what a commit writes; this only
// chooses what is shown. Styled like the ERP's submenu tabs (§3), at thumb
// height. Wrap the segments in `flex gap-1 rounded-lg bg-background p-1`.
import { cn } from '@/lib/utils'

export function Segment({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex-1 h-11 rounded-md text-base font-medium transition-colors',
        active ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground active:bg-accent/10',
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn('ml-1.5 text-sm tabular-nums', active ? 'text-accent-foreground/70' : 'text-muted-foreground/70')}>
          {count}
        </span>
      )}
    </button>
  )
}
