import { Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { BonnetierAvatar } from '@/components/shared/PieceEvents'
import { SectionBand } from '@/components/shared/SectionBand'
import { fmtHeure, fmtHeuresMin, fmtTotalHeures, type BonnetierEquipe } from '@/lib/trs-equipe'
import { cn } from '@/lib/utils'

/** The legacy `ZR_Equipe`: who clocked in during the shift (the `pointage`
 *  table, not the planning), their presence intervals, their pauses, their
 *  hours — and the `LIB_Total` line at the bottom, verbatim. */
export function EquipePanel({
  rows,
  totalS,
  className,
}: {
  rows: BonnetierEquipe[]
  totalS: number
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-border/60 bg-white shadow-sm overflow-hidden flex flex-col', className)}>
      <SectionBand icon={Users}>Équipe</SectionBand>
      <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-100/80 p-3 space-y-2 scrollbar-transparent">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-6">Aucun pointage sur cette équipe</p>
        ) : (
          rows.map((b) => {
            const name = [b.prenom, b.nom].filter(Boolean).join(' ')
            return (
              <div key={b.id} className="rounded-lg border border-border/60 bg-card p-2 shadow-sm flex items-center gap-2.5">
                <BonnetierAvatar id={b.id} name={name} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-medium truncate">{b.prenom || name}</p>
                    {b.regleur && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-accent/10 text-accent border-accent/20">
                        régleur
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums truncate">
                    {b.intervalles.map((i) => `${fmtHeure(i.debutMs)} – ${fmtHeure(i.finMs)}`).join(' · ')}
                  </p>
                  {b.pauses.length > 0 && (
                    <p className="text-[11px] text-muted-foreground/80 tabular-nums truncate">
                      Pause{b.pauses.length > 1 ? 's' : ''}{' '}
                      {b.pauses.map((i) => `${fmtHeure(i.debutMs)} – ${fmtHeure(i.finMs)}`).join(', ')}
                    </p>
                  )}
                </div>
                <p className="text-sm font-semibold tabular-nums whitespace-nowrap">{fmtHeuresMin(b.dureeS)}</p>
              </div>
            )
          })
        )}
      </div>
      <div className="flex-shrink-0 border-t border-border/60 bg-zinc-200/50 px-3 py-2 text-sm font-semibold tabular-nums">
        {fmtTotalHeures(totalS)}
      </div>
    </div>
  )
}
