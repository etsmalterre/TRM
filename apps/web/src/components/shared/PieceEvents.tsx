// Bonnetier avatar + `evenement_piece` timeline — the two pieces every TRM
// screen that shows who touched a roll needs.
//
// Extracted verbatim from ProductionOf.tsx when Qualité › Retour client needed
// the same rendering for its Traçabilité tab: a client complaint is answered by
// looking at exactly this list (« qui tricotait, qui a pesé, qui a nettoyé »),
// so a second copy would have drifted the moment one screen gained an event
// label the other didn't.
//
// The photo comes from `bonnetier.photo`, a real JPEG blob served by
// /of-trm/bonnetiers/:id/photo (binary needs queryRaw — the normal query path
// UTF-8-mangles it). A 404 is the normal answer for staff without a portrait;
// the Avatar falls back to initials.
//
// « Défaut » is not an `evenement_piece` row: Production › TRS folds the
// piece's `defaut_qualite` rows into the same list, as the legacy FI_TRS
// `ZR_Detail` did (UNION, 'Défaut' AS evenement, description AS observation),
// and paints it red the way the legacy card did.

import type { ComponentType } from 'react'
import { Brush, Circle, Eye, Flag, Pause, Play, Scale, TriangleAlert } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { API_URL } from '@/lib/api'
import { formatHfsqlDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

export interface PieceEvent {
  id: number | string
  date: string | null
  evenement: string
  observation: string
  IDbonnetier: number
  bonnetier: string
}

/** HFSQL DATETIME or the 8-char date → `31/07/2026 08:16`. */
export function fmtEventDateTime(raw: string | null): string {
  if (!raw) return '—'
  if (/^\d{8}$/.test(raw)) return formatHfsqlDate(raw)
  const d = new Date(raw.replace(' ', 'T'))
  if (isNaN(d.getTime())) return raw
  return `${d.toLocaleDateString('fr-FR')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function BonnetierAvatar({
  id,
  name,
  className,
}: {
  id: number
  name: string
  className?: string
}) {
  const initials = name
    ? name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : 'B'
  return (
    <Avatar
      className={cn('h-8 w-8 border border-border/60', className)}
      src={id > 0 ? `${API_URL}/of-trm/bonnetiers/${id}/photo` : undefined}
      alt={name || 'Bureau'}
      fallback={initials}
    />
  )
}

/** Event label → icon. Legacy spellings are listed alongside the current ones:
 *  the workshop terminal has written both over the years. */
export const EVENT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'Début du tricotage': Play,
  'Fin du tricotage': Flag,
  'Fin de tricotage': Flag, // legacy spelling
  'Nettoyage': Brush,
  'Visitage tombé métier': Eye,
  'Visitage Tombé de métier': Eye, // legacy spelling
  'Pesage tombé métier': Scale,
  'Interruption OF': Pause,
  'Reprise OF': Play,
  'Défaut': TriangleAlert,
}

/** The one event that is an anomaly rather than a step of the work. */
const EVENT_ALERTE = new Set(['Défaut'])

export function EventTimeline({
  events,
  loading,
  emptyLabel = 'Aucun évènement',
}: {
  events: PieceEvent[] | undefined
  loading: boolean
  emptyLabel?: string
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    )
  }
  if (!events || events.length === 0) {
    return <p className="text-sm text-muted-foreground italic text-center py-3">{emptyLabel}</p>
  }
  return (
    <div className="space-y-1.5">
      {events.map((e) => {
        const Icon = EVENT_ICONS[e.evenement] ?? Circle
        const alerte = EVENT_ALERTE.has(e.evenement)
        return (
          <div key={e.id} className="p-2 rounded-lg border bg-card shadow-sm flex items-center gap-2.5">
            <BonnetierAvatar id={e.IDbonnetier} name={e.bonnetier} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium truncate">{e.bonnetier || 'Bureau'}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
                  {fmtEventDateTime(e.date)}
                </p>
              </div>
              <p className={cn('text-xs flex items-center gap-1 truncate', alerte ? 'text-red-700' : 'text-muted-foreground')}>
                <Icon className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">
                  {e.evenement}
                  {e.observation ? ` — ${e.observation}` : ''}
                </span>
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
