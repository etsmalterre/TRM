// One standing note of the écru reference (`obs_ref_ecru`) — the ERP's
// « Commentaires historiques », in the SAME gold clothes the ERP gives them
// (`ObsRefEcru.tsx` / `CreateOfDialog`): the régleur meets these notes at the
// launch on the phone and again on the fiche at the desk, and two different
// dressings made them read as two unrelated things (decision 2026-08-27).
//
// Read-only here. The notes belong to the reference, not to the OF: they are
// written in the ERP (Production › OF, Tombé Métier › Références), and a note
// written today shows on an OF launched two years ago — that is the point.
import { cn } from '@/lib/utils'
import { formatDateHfsql } from '@/lib/dates'
import type { NoteRef } from '@/lib/atelier-api'

export function NoteRefCarte({ note }: { note: NoteRef }) {
  return (
    <div className="rounded-lg border border-gold/30 border-l-4 border-l-gold bg-gold-light/60 px-3 py-2">
      {/* The scope, in the legacy's own words. The axis the note actually
          targets is bold — « Toutes » / « Tout coloris » must not read with
          the same weight as a real métier. */}
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground min-w-0 flex-wrap">
        <span className="tabular-nums">{formatDateHfsql(note.date) || '—'}</span>
        <span>·</span>
        <span className={cn(note.cible_machine && 'font-semibold text-foreground')}>{note.machine}</span>
        <span>·</span>
        <span className={cn(note.cible_coloris && 'font-semibold text-foreground')}>{note.coloris}</span>
      </div>
      <p className="text-sm whitespace-pre-line mt-1">{note.observation}</p>
    </div>
  )
}
