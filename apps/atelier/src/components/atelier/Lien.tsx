// A navigation row of the poste's band 3 (and of the réglage sheet): icon,
// label, one line of detail, chevron — the legacy's 24 px top-bar glyphs
// (IMG_Warning, IMG_Consigne, IMG_Historique) as station-scale rows. Same
// height as the tiles of the métier list, so a thumb finds it the same way.
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

export function Lien({
  onClick,
  icone,
  label,
  detail,
  badge,
}: {
  onClick: () => void
  icone: ReactNode
  label: string
  detail: string
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border border-border bg-card shadow-sm p-3 flex items-center gap-2.5 active:bg-muted transition-colors min-w-0"
    >
      <span className="relative flex-shrink-0 h-9 w-9 rounded-full bg-secondary text-primary flex items-center justify-center">
        {icone}
        {badge !== undefined && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-gold-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
            {badge}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{label}</span>
        <span className="block text-xs text-muted-foreground truncate">{detail}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    </button>
  )
}
