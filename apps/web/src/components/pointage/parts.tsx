// Shared pieces of the two « Pointage » screens (Horaires, Salariés): the §27
// sortable header cell, the §27.5 drawer card and KV row, and the small notes
// a correction leaves behind (sync of the twin tables, refused input).
import type { ReactNode } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Issue } from '@/lib/pointage-admin'

export interface SortState<K extends string> {
  key: K
  dir: 'asc' | 'desc'
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string
  sortKey: K
  sort: SortState<K>
  onSort: (k: K) => void
  align?: 'left' | 'right'
}) {
  const active = sort.key === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={cn(
        'px-2 py-2.5 font-semibold cursor-pointer select-none whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
        active && 'text-accent',
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  )
}

export function DrawerCard({
  icon,
  title,
  highlight,
  action,
  children,
}: {
  icon: ReactNode
  title: string
  highlight?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border/60 bg-card p-3 shadow-sm',
        highlight && 'border-l-4 border-l-accent/70 bg-accent/[0.03]',
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold flex-1 min-w-0 truncate">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

export function KV({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm text-right truncate', mono && 'tabular-nums')}>{value}</span>
    </div>
  )
}

/** The `h-7` right-aligned input of an edit-mode KV value slot (§27.5). */
export const INPUT_KV =
  'h-7 px-2 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring text-right'

/** A refused correction, in the drawer body (the band keeps its own light-on-navy copy). */
export function ErreurNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 text-red-700 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-red-900">{message}</p>
    </div>
  )
}

/** What a write did to the two mirrors of `lst_horaire` — said only when it
 *  could not follow, the normal case is silent. `introuvable` on the twin is
 *  expected for a shift the old Admin Pointage typed by hand. */
export function SyncNote({ sync }: { sync: { lstPointage: Issue; mps?: Issue } | undefined }) {
  if (!sync) return null
  const notes: string[] = []
  if (sync.lstPointage === 'introuvable') notes.push('Pas de jumelle TricoBot pour ce poste (saisi à la main dans l’ancien Admin Pointage) : elle n’a pas été mise à jour.')
  if (sync.lstPointage === 'echec') notes.push('La jumelle TricoBot n’a pas pu être mise à jour.')
  if (sync.mps === 'echec') notes.push('Le journal de présence du TRS n’a pas pu être mis à jour.')
  if (notes.length === 0) return null
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-start gap-2">
      <Info className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
      <div className="text-xs text-amber-900 space-y-0.5">
        {notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </div>
    </div>
  )
}

/** « NOM Prénom » as the legacy grids concatenate it. */
export function nomComplet(s: { nom: string; prenom: string }): string {
  return [s.nom, s.prenom].filter(Boolean).join(' ') || '—'
}
