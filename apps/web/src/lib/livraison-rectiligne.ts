// Delivering cols / bandes by quantity (LIVA #1381) — what the « Livrer »
// dialog of Clients › Commandes reads before it posts. The rules live in the
// MPS API (lib/livraison-rectiligne.ts, which re-checks everything): a
// rectiligne line has no roll, so what leaves is a count typed by the person
// who ships.

/** A typed quantity → a number with two decimals at most; 0 for an empty or
 *  unreadable field (nothing is delivered then). */
export function lireQuantite(saisie: string | undefined): number {
  const txt = (saisie ?? '').trim().replace(/\s/g, '').replace(',', '.')
  if (!txt) return 0
  const v = Number(txt)
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.round(v * 100) / 100
}
