// « Consigne » — the standing instruction the régleur writes on an OF for the
// people who work it (`ordre_fabrication.observations`).
//
// It is NOT a comment: it is an order that changes what the operator does with
// their hands — « Max 1 maille jusqu'à la fin de la pièce. Réparer à chaque
// nouvelle pièce ». Whoever opens the run has to obey it, so it renders as a
// red callout everywhere it appears rather than as one more field on a card
// (§46 of the design system). It was born at the poste de visitage, where the
// screen is read at arm's length across a workshop; the OF fiche now shows the
// same object the same way, because a consigne that looks like a note on one
// screen and an alert on the other teaches the reader it is optional.
//
// ⚠️ Red is a deliberate STRETCH of §41, not a free application of it: on the
// live queue 6 of the 10 running OFs carry a consigne (0 of the 5 waiting),
// and four of those six are the same boilerplate sentence. It ships red on the
// user's call (2026-08-27) because of what the field is — an order, read at a
// station — and because the poste already shouted it; the bug being fixed is
// the inconsistency. If the boilerplate ever spreads to nearly every OF, the
// colour has stopped discriminating: demote the fiche to §24 grey rather than
// leaving a wall of red. See §46.2 for the test to re-run.
//
// Only the label and the frame are red; the sentence itself stays foreground
// text, because a paragraph of red body copy reads as an error message and is
// harder to read at the distance a poste is worked from.
import { AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Renders nothing when there is no consigne — HFSQL stores `" "` for empty
 *  (§24), so the check is on the trimmed value, and the caller can hand over
 *  the raw column. */
export function ConsigneCallout({ texte, className }: { texte: string | null | undefined; className?: string }) {
  const consigne = texte?.trim()
  if (!consigne) return null
  return (
    <Card className={cn('p-3 flex items-start gap-2.5 border-destructive/30 bg-destructive/5', className)}>
      <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-destructive">Consigne</div>
        <p className="text-sm mt-0.5 whitespace-pre-wrap">{consigne}</p>
      </div>
    </Card>
  )
}
