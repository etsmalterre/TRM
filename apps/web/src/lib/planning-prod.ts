// Production › Planning (LIVA #1250) — wire types of /api/planning-prod-trm
// and the pure helpers of the timeline (positions, drop order). The plan is
// computed by the API (ETM/apps/api/src/lib/planning-prod-trm.ts); this side
// only draws it and turns a drop into « this métier, in this order ».

export interface Intervalle { debut: number; fin: number }
export type RegimeId = '3x8' | '2x8' | '2x7' | 'custom'
export interface Horaire { debut: string; fin: string }
export type SemaineHoraires = Array<Horaire | null>

export interface PlanMachine {
  id: number
  label: string
  rendement: number
  rendement_source: 'mesure' | 'parc' | 'defaut'
  rendement_echantillons: number
}

export interface PlanSegment {
  type: 'of' | 'ligne'
  /** OF id for 'of', line id for 'ligne'. */
  id: number
  ligneId: number
  idmachine: number
  kg: number
  debut: number
  fin: number
  minutes: number
  actif: boolean
  approx: boolean
  horsHorizon: boolean
  epingle: boolean
}

export interface PlanLigne {
  ligne_id: number
  commande_id: number
  numero: number
  client: string
  miroir: boolean
  reference: string
  coloris: string
  quantite: number
  reste_a_lancer: number
  date_livraison: string | null
  fin_prevue: number | null
  en_retard: boolean
  machines_compatibles: number[]
  non_planifiable: boolean
}

export interface PlanOf {
  id: number
  ligne_id: number
  quantite: number
  reste_kg: number
  actif: boolean
  reference: string
  coloris: string
  /** Métiers set up for its ref — the drop targets of a waiting OF. */
  machines_compatibles: number[]
}

export interface Plan {
  maintenant: number
  reel_jusqua: number
  calendrier_fin: number
  reglage: { regime: RegimeId; horaires: SemaineHoraires | null; modifie_le: string | null; semaine: SemaineHoraires }
  regimes: Record<Exclude<RegimeId, 'custom'>, { libelle: string; semaine: SemaineHoraires }>
  ouvert: Intervalle[]
  machines: PlanMachine[]
  segments: PlanSegment[]
  lignes: PlanLigne[]
  ofs: PlanOf[]
}

export const JOUR_MS = 24 * 60 * 60 * 1000

export const REGIME_LIBELLES: Record<RegimeId, string> = {
  '3x8': '3×8',
  '2x8': '2×8',
  '2x7': '2×7',
  custom: 'Personnalisé',
}

export const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

/** Key of a segment, unique across both kinds. */
export function cleSegment(s: Pick<PlanSegment, 'type' | 'id'>): string {
  return `${s.type}:${s.id}`
}

/** Local midnight of an instant. */
export function minuit(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** The local midnights from `de` (inclusive) to `a` (exclusive) — DST-safe. */
export function joursEntre(de: number, a: number): number[] {
  const out: number[] = []
  const d = new Date(minuit(de))
  while (d.getTime() < a) {
    out.push(d.getTime())
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** The closed spans (complement of `ouvert`) inside [de, a). */
export function fermetures(ouvert: Intervalle[], de: number, a: number): Intervalle[] {
  const out: Intervalle[] = []
  let t = de
  for (const i of [...ouvert].sort((x, y) => x.debut - y.debut)) {
    if (i.fin <= t) continue
    if (i.debut >= a) break
    if (i.debut > t) out.push({ debut: t, fin: Math.min(i.debut, a) })
    t = Math.max(t, i.fin)
    if (t >= a) break
  }
  if (t < a) out.push({ debut: t, fin: a })
  return out
}

/**
 * The order to save after a drop: the movable segments of the target métier
 * (same kind as the dragged one, the dragged one removed), with the dragged
 * one inserted before the first whose middle lies right of the drop instant.
 */
export function ordreApresDepot(
  cibles: Array<Pick<PlanSegment, 'id' | 'debut' | 'fin'>>,
  deplaceId: number,
  instant: number,
): number[] {
  const autres = cibles.filter((s) => s.id !== deplaceId).sort((a, b) => a.debut - b.debut)
  const idx = autres.findIndex((s) => (s.debut + s.fin) / 2 > instant)
  const ids = autres.map((s) => s.id)
  ids.splice(idx < 0 ? ids.length : idx, 0, deplaceId)
  return ids
}

/** « jeu. 9 oct. 14:00 » */
export function fmtInstant(ms: number | null): string {
  if (ms === null) return '—'
  return new Date(ms).toLocaleString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/** « jeu. 9 oct. » */
export function fmtJour(ms: number | null): string {
  if (ms === null) return '—'
  return new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** 'YYYY-MM-DD' → « 9 oct. » */
export function fmtDelai(iso: string | null): string {
  if (!iso) return 'Sans délai'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Worked duration as « 3 j 4 h » / « 5 h 20 ». */
export function fmtDuree(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h >= 24) return `${Math.floor(h / 24)} j ${h % 24} h`
  if (h > 0) return m > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
  return `${m} min`
}
