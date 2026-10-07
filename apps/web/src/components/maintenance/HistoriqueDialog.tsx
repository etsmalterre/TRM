// The history of one maintenance item (a garniture line, an entretien, the
// rouloir, an atelier item): every time it was done, newest first, with the
// comment typed then and who typed it. Opened by clicking the item's line
// outside edit mode (the régleurs, 2026-10-07). Read-only: edit mode corrects
// the latest entry from the fiche itself.
//
// Banded « bilan » dialog (mps_designer §18.D): mostly read, so the app's
// panel composition rather than a white sheet.
//
// API: GET /maintenance-trm/metiers/:id/historique?item=… or
// /maintenance-trm/operations/:id/historique (trm_maintenance_journal).

import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CalendarCheck, History, Loader2, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { formatHfsqlDate } from '@/lib/dates'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface HistoriqueEntree {
  id: number
  /** 'YYYYMMDD'. */
  date: string
  commentaire: string | null
  /** Seeded from the date the item carried when the history began — no person. */
  reprise: boolean
  /** ISO local date-time, null on a reprise. */
  saisiLe: string | null
  saisiPar: string | null
  /** Kg knitted from this entry to the next (the newest: since). Null = atelier item. */
  kgPeriode: number | null
}

/** "le 07/10/2026 à 15:24" from the API's local ISO date-time. */
function saisiLabel(iso: string | null): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  return m ? `le ${m[3]}/${m[2]}/${m[1]} à ${m[4]}:${m[5]}` : null
}

export function HistoriqueDialog({
  open,
  onOpenChange,
  path,
  title,
  subtitle,
  onFait,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** API path of the item's history, null while closed. */
  path: string | null
  title: string
  /** The item's identity: métier, frequency… */
  subtitle: string
  /** « Effectué ce jour » from here — absent without the right. */
  onFait?: () => void
}) {
  const { data, isLoading, isError } = useQuery<{ entrees: HistoriqueEntree[] }>({
    queryKey: ['maintenance-trm-historique', path],
    queryFn: () => apiFetch(path!),
    enabled: open && path !== null,
    staleTime: 0,
  })
  const entrees = data?.entrees ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 border-0 bg-primary overflow-hidden max-h-[90dvh] flex flex-col">
        <div className="flex-shrink-0 flex items-center gap-2.5 border-b-2 border-gold bg-primary px-4 py-2.5 rounded-t-lg">
          <div className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center shadow-sm bg-gold text-gold-foreground">
            <History className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-heading font-bold tracking-tight truncate text-primary-foreground">
              {title}
            </h2>
            <p className="text-xs text-white/70 truncate">{subtitle}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white flex-shrink-0"
            title="Fermer"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-100 p-4 space-y-3 scrollbar-transparent">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-10 text-destructive">
              <AlertCircle className="h-5 w-5 mb-2" />
              <p className="text-xs">Impossible de charger l&apos;historique.</p>
            </div>
          ) : entrees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <History className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">Jamais fait</p>
              <p className="text-xs mt-1">Aucune intervention enregistrée.</p>
            </div>
          ) : (
            entrees.map((e, i) => (
              <div
                key={e.id}
                className={cn(
                  'rounded-lg border border-border/60 bg-card p-3 shadow-sm',
                  i === 0 && 'border-l-4 border-l-primary/70',
                )}
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-sm font-semibold tabular-nums">{formatHfsqlDate(e.date)}</p>
                  {i === 0 && (
                    <span className="rounded-full px-1.5 text-[10px] font-medium border bg-primary/10 text-primary border-primary/20">
                      Dernière fois
                    </span>
                  )}
                  {e.kgPeriode !== null && (
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {fmtNum(e.kgPeriode)} Kg tricotés {i === 0 ? 'depuis' : "jusqu'à la suivante"}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    'text-sm mt-1.5 whitespace-pre-wrap',
                    !e.commentaire && 'text-muted-foreground italic',
                  )}
                >
                  {e.commentaire || 'Sans commentaire'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {e.reprise
                    ? "Reprise de l'ancienne fiche — saisie avant l'historique"
                    : `Saisi par ${e.saisiPar ?? 'un compte inconnu'} ${saisiLabel(e.saisiLe) ?? ''}`}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-3 border-t border-border/60 bg-zinc-200 px-4 py-3 rounded-b-lg">
          <p className="text-xs text-muted-foreground">
            {entrees.length > 0 && `${entrees.length} intervention${entrees.length > 1 ? 's' : ''}`}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
            {onFait && (
              <Button onClick={onFait}>
                <CalendarCheck className="h-3.5 w-3.5 mr-1.5" />
                Effectué ce jour
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
