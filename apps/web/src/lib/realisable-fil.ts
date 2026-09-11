/**
 * « Réalisable (stock de fil) » of an OF, in Kg of fabric — the fabric the
 * chosen LOTS still allow. Verbatim copy of the API's rule
 * (`ETM/apps/api/src/lib/realisable-fil-trm.ts`, checked by the test next to
 * this file): per lot, stock ÷ (Σ % of the rows it feeds) — two feeding
 * positions on one lot draw on it together — then the minimum over lots (a
 * blend only knits while every component lasts). `null` when no row has a lot
 * (nothing to estimate from).
 *
 * The unit is the lot, never the (fil, coloris) pair: the OF reserves a lot,
 * the visitage decrements that lot, and the pair's other lots may be another
 * customer's yarn (LIVA #1147). Shared by « Finir le fil » (draft and params
 * card, so the snapshot and the live draft agree — otherwise opening edit mode
 * on a « finir le fil » OF would read as dirty before any keystroke) and by
 * the Réalisable bar the API sends.
 */
export interface LotShare {
  IDstock_fil: number
  /** Stock of the chosen lot, in Kg. */
  lot_stock: number
  /** A number from the API, a typed string in the edit draft. */
  pourcentage: number | string
}

function parsePct(v: number | string): number {
  if (typeof v === 'number') return v
  const x = parseFloat(v.replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

export function realisableSurFil(rows: LotShare[]): number | null {
  const byLot = new Map<number, { stock: number; pct: number }>()
  for (const c of rows) {
    const pct = parsePct(c.pourcentage)
    if (c.IDstock_fil <= 0 || !(pct > 0)) continue
    const cur = byLot.get(c.IDstock_fil) ?? { stock: c.lot_stock, pct: 0 }
    cur.pct += pct
    byLot.set(c.IDstock_fil, cur)
  }
  if (byLot.size === 0) return null
  let min = Infinity
  for (const { stock, pct } of byLot.values()) min = Math.min(min, Math.max(0, stock) / (pct / 100))
  return Number.isFinite(min) ? min : null
}
