// The small figure pill of the métier tiles, shared by every list of this app
// (the métier picker, the idle poste's history). Soft tints of the tablet's
// status colours — it paints them solid; the phone's pills are tinted like the
// rest of the app. `rouge` is the plain alert pill, `teinte` the three-step
// ladder of lib/teinte-arrets.ts, `accent` the informational blue, nothing =
// neutral grey.
import { cn } from '@/lib/utils'
import type { TeinteArrets } from '@/lib/teinte-arrets'

const TEINTE_PASTILLE: Record<TeinteArrets, string> = {
  vert: 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30',
  ambre: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
  rouge: 'bg-destructive/10 text-destructive border-destructive/30',
}

export function Pastille({
  rouge,
  accent,
  teinte,
  title,
  className,
  children,
}: {
  rouge?: boolean
  accent?: boolean
  teinte?: TeinteArrets
  title?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 h-6 text-xs font-medium tabular-nums border whitespace-nowrap flex-shrink-0',
        teinte
          ? TEINTE_PASTILLE[teinte]
          : rouge
            ? TEINTE_PASTILLE.rouge
            : accent
              ? 'bg-primary/10 text-primary border-primary/25'
              : 'bg-secondary text-muted-foreground border-border/60',
        className,
      )}
    >
      {children}
    </span>
  )
}
