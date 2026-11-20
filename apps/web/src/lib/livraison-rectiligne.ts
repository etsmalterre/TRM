// Delivering cols / bandes by quantity (LIVA #1381) — what the « Livrer »
// dialog of Clients › Commandes computes before it posts. The rules live in
// the MPS API (lib/livraison-rectiligne.ts, which re-checks everything): a
// rectiligne line has no roll, so what leaves is a count typed by the person
// who ships; delivering more than what remains is allowed, the screen only
// says so.

export interface LigneALivrer {
  IDligne_commande_client: number
  quantite: number
  /** Pieces already delivered (`expedie` of a rectiligne line). */
  expedie: number
  reste_a_livrer: number
}

/** A typed quantity → a number with two decimals at most; 0 for an empty or
 *  unreadable field (the line is then simply not delivered). */
export function lireQuantite(saisie: string | undefined): number {
  const txt = (saisie ?? '').trim().replace(/\s/g, '').replace(',', '.')
  if (!txt) return 0
  const v = Number(txt)
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.round(v * 100) / 100
}

export interface ResumeLivraison {
  /** What to post: the lines with a quantity, in the order of the order. */
  lignes: Array<{ IDligne_commande_client: number; quantite: number }>
  total: number
  /** Lines delivered beyond what remained, with the excess. */
  depassements: Map<number, number>
}

export function resumerLivraison(lignes: LigneALivrer[], saisies: Record<number, string>): ResumeLivraison {
  const out: ResumeLivraison = { lignes: [], total: 0, depassements: new Map() }
  for (const l of lignes) {
    const q = lireQuantite(saisies[l.IDligne_commande_client])
    if (!(q > 0)) continue
    out.lignes.push({ IDligne_commande_client: l.IDligne_commande_client, quantite: q })
    out.total = Math.round((out.total + q) * 100) / 100
    const excess = Math.round((q - l.reste_a_livrer) * 100) / 100
    if (excess > 0) out.depassements.set(l.IDligne_commande_client, excess)
  }
  return out
}

/** « Tout le reste »: every line still owed, at what remains of it. */
export function saisiesDuReste(lignes: LigneALivrer[]): Record<number, string> {
  const out: Record<number, string> = {}
  for (const l of lignes) {
    if (l.reste_a_livrer > 0) out[l.IDligne_commande_client] = String(l.reste_a_livrer).replace('.', ',')
  }
  return out
}
