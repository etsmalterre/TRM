// « Hors réf » — marks a yarn the run knits that the écru reference's own
// composition does NOT list.
//
// Why it exists: the régleur uses "Ajouter un fil" to knit a small deliberate
// variation of the reference — most often to burn internal stock on a run he
// knows the customer will not notice. The OF freezes its `asso_fil_of` and
// never re-reads `composition_ecru`, so the fact was already recorded — but
// nothing showed it, in the création dialog or on the fiche six months later,
// and the whole point of recording a variation is being able to see it later
// (user decision, 2026-08-26; his wording: "hors réf").
//
// Deliberately NEUTRAL, not a warning colour (§7): a variation is a normal
// decision, not an anomaly. And on pre-2022 OFs a hit is often just drift —
// the reference's sheet changed since the run — so painting it amber would cry
// wolf on history. It is a fact to notice, not a problem to fix.
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** `fils` (optional) names the off-sheet yarns in the tooltip — the commande's
 *  pieces and OFs carry them (MPS API `hors_ref`, lib/hors-ref-trm.ts). Shown
 *  in the app only: the BL sent to a client never prints it. */
export function HorsRefBadge({ className, fils }: { className?: string; fils?: { label: string }[] }) {
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] py-0 font-normal bg-accent/10 text-accent border-accent/30', className)}
      title={fils && fils.length > 0
        ? `Tricoté avec un fil absent de la composition de la référence écru : ${fils.map((f) => f.label).join(', ')}`
        : "Ce fil n'est pas dans la composition de la référence écru — variation propre à cet OF"}
    >
      hors réf
    </Badge>
  )
}
