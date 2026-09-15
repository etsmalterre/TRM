// A bare-icon navigation button of an OF header (band 2): 44 px (a thumb
// target at the station), the Lien card's look and gold badge. The label only
// lives in title / aria-label — the régleur learns the icon.
//
// Shared by the poste and the réglage sheet so the OF's Consigne · Fils ·
// Historique corner is one control wherever an OF is on screen (2026-09-15).
import type { ReactNode } from 'react'

export function BoutonIcone({
  onClick,
  label,
  badge,
  children,
}: {
  onClick: () => void
  label: string
  badge?: number
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="relative h-11 w-11 rounded-xl border border-border bg-card shadow-sm text-primary flex items-center justify-center active:bg-muted transition-colors"
    >
      {children}
      {badge !== undefined && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-gold-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
          {badge}
        </span>
      )}
    </button>
  )
}
