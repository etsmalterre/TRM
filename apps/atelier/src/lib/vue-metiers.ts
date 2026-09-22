// Which of the métier list's two tabs a métier sits on, and the URL of that
// tab. The tab lives in the URL (`/?vue=inactifs`) rather than in component
// state, so coming back from a métier lands on the tab it was opened from —
// a poste reached from Inactifs used to come back to Actifs (2026-09-15).
import type { Machine } from '@/lib/atelier-api'

export type VueMetiers = 'actifs' | 'inactifs'

/** A régleur's Inactifs are the métiers with no OF at all (an OF in réglage
 *  is their work, so it stays in Actifs). A bonnetier's follow `actif` — and
 *  an OF not yet launched counts as inactive too (Vincent, 2026-09-22): the
 *  bonnetier can no longer launch it, so until the régleur has, there is
 *  nothing for them to do on that métier. */
export function estInactif(m: Pick<Machine, 'actif' | 'of'>, regleur: boolean): boolean {
  if (regleur) return !m.of
  return !m.actif || (!!m.of && !m.of.demarre)
}

export function lireVue(params: URLSearchParams): VueMetiers {
  return params.get('vue') === 'inactifs' ? 'inactifs' : 'actifs'
}

/** The list, on the tab this métier belongs to NOW — if the ERP activated an
 *  OF while the poste was open, back lands on Actifs where the métier went. */
export function cheminListe(m: Pick<Machine, 'actif' | 'of'> | undefined, regleur: boolean): string {
  return m && estInactif(m, regleur) ? '/?vue=inactifs' : '/'
}
