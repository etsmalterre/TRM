import type { ComponentType, ReactNode } from 'react'

/** The §43 navy widget band capping a card-like section: gold icon tile,
 *  white title, optional right-aligned actions (ghost white buttons). The
 *  same band ProductionPrime draws inline; shared here for the TRS screen. */
export function SectionBand({
  icon: Icon,
  children,
  actions,
}: {
  icon: ComponentType<{ className?: string }>
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5">
      <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <h2 className="min-w-0 flex-1 text-base font-heading font-bold tracking-tight truncate text-primary-foreground">
        {children}
      </h2>
      {actions}
    </div>
  )
}
