// Production › TRS — the client side of `GET /api/trs/equipe`: the payload
// types (a hand-kept mirror of ETM/apps/api/src/lib/trs-equipe-trm.ts —
// keep the two in step), the fetch, the formatters the screen shares, the
// time scale of the timeline and the rules the ⓘ dialog quotes.
//
// Nothing here is a chart library: the timeline is hand-drawn SVG, and this
// file holds the pure geometry so trs-equipe.test.ts can pin it. The rules
// block is pinned against the API's own constants by the same test (it
// imports ETM/apps/api/src/lib/trs-trm.ts directly, the way
// apps/trs/src/lib/regles.test.ts already does) — change the API first, the
// test says when to follow.

import { apiFetch } from '@/lib/api'
import { fmtNum } from '@/lib/format'

// ── Payload (mirror) ─────────────────────────────────────

export type EquipeNom = 'Matin' | 'Après-Midi' | 'Nuit'
export type Teinte = 'vert' | 'ambre' | 'rouge'

export interface TrsDetail {
  arretsDeduits: number
  arretsDeduitsS: number
  nettoyages: number
  nettoyagesS: number
  finsPiece: number
  finsPieceS: number
  evenementsPiece: number
  lycra: boolean
}

export interface EvenementTimeline {
  atMs: number
  type: 'nettoyage' | 'debut_piece' | 'debut_of' | 'fin_of'
  numero: number | null
  prenom: string
  bonnetierId: number
  ofId: number
  pieceId: number | null
}

export interface Intervalle {
  debutMs: number
  finMs: number
}

export interface MachineEquipe {
  id: number
  emplacement: string
  sansAutomate: boolean
  of: { id: number; reference: string; coloris: string; vitesse: number; vitesseCible: number } | null
  fenetres: Intervalle[]
  segments: { debutMs: number; finMs: number; etat: 0 | 1 }[]
  evenements: EvenementTimeline[]
  trs: number | null
  arrets: number
  arretsParHeure: number
  tempsProdS: number
  tempsMarcheS: number
  deductibleS: number
  detail: TrsDetail
  teintes: { vitesse: Teinte; arrets: Teinte; trs: Teinte | null }
}

export interface LignePiece {
  cle: string
  id: number
  machine: string
  numero: string
  poids: number
  reference: string
  finMs: number | null
  visiteeMs: number | null
  secondChoix: boolean
  ofId: number
}

export interface EvenementCarte {
  id: string
  date: string | null
  evenement: string
  observation: string
  IDbonnetier: number
  bonnetier: string
}

export interface BonnetierEquipe {
  id: number
  prenom: string
  nom: string
  regleur: boolean
  intervalles: Intervalle[]
  pauses: Intervalle[]
  dureeS: number
}

export interface KpiEquipe {
  production: { pieces: number; kg: number; kgParHeure: number | null }
  visitage: { pieces: number; kg: number; kgParHeure: number | null }
  secondChoix: { pieces: number; kg: number; pct: number | null }
  nonVisitees: { pieces: number; heureFin: number }
}

export interface TrsEquipe {
  generatedAt: string
  equipe: {
    nom: EquipeNom
    debut: string
    fin: string
    debutLit: string
    enCours: boolean
    passee: boolean
    precedentLit: string
    suivantLit: string | null
  }
  kpi: KpiEquipe
  parc: { trs: number | null }
  machines: MachineEquipe[]
  pieces: {
    production: LignePiece[]
    visitage: LignePiece[]
    secondChoix: LignePiece[]
    nonVisitees: LignePiece[]
  }
  evenements: Record<string, EvenementCarte[]>
  equipeBonnetiers: { rows: BonnetierEquipe[]; totalS: number }
  dernierEvenement: string | null
}

export type VueKpi = 'production' | 'visitage' | 'secondChoix' | 'nonVisitees'
export type Vue = 'timeline' | VueKpi

export function fetchEquipe(debut?: string | null): Promise<TrsEquipe> {
  return apiFetch<TrsEquipe>(`/trs/equipe${debut ? `?debut=${encodeURIComponent(debut)}` : ''}`)
}

/** React Query key — `null` debut = the current shift. */
export const trsEquipeKey = (debut: string | null) => ['trs-equipe', debut ?? 'courante'] as const

// ── The rules the ⓘ dialog quotes (pinned against the API by the test) ──

export const REGLES = {
  /** Max intervention time deducted per machine stop, minutes. */
  interventionMaxMin: 1,
  /** Net allowances the API deducts (the « −1 min already counted at the
   *  stop » is applied): nettoyage 3 / 6 min, fin de pièce 5 / 8 min. */
  forfaitsMin: { nettoyage: { sans: 3, lycra: 6 }, finPiece: { sans: 5, lycra: 8 } },
  seuils: {
    vitesse: { rouge: 20, ambre: 25 },
    arretsParHeure: { vertMax: 1, ambreMax: 2 },
    trs: { rouge: 0.8, ambre: 0.9 },
  },
  /** The legacy shift grid, 5 h / 13 h / 21 h. */
  equipes: [
    { nom: 'Matin', debut: '5 h', fin: '13 h' },
    { nom: 'Après-midi', debut: '13 h', fin: '21 h' },
    { nom: 'Nuit', debut: '21 h', fin: '5 h' },
  ],
} as const

/** The gross allowances as the bonnetier lives them (intervention minute
 *  included) — what the dialog prints, the API storing the nets. */
export const FORFAITS_BRUTS_MIN = {
  nettoyage: {
    sans: REGLES.forfaitsMin.nettoyage.sans + REGLES.interventionMaxMin,
    lycra: REGLES.forfaitsMin.nettoyage.lycra + REGLES.interventionMaxMin,
  },
  finPiece: {
    sans: REGLES.forfaitsMin.finPiece.sans + REGLES.interventionMaxMin,
    lycra: REGLES.forfaitsMin.finPiece.lycra + REGLES.interventionMaxMin,
  },
} as const

// ── Formatting ───────────────────────────────────────────

const p2 = (x: number) => String(x).padStart(2, '0')

/** « 13:37 » */
export function fmtHeure(ms: number | string | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  const d = new Date(ms)
  if (isNaN(d.getTime())) return '—'
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** « 13:37:29 » — the legacy bubble of a running period. */
export function fmtHeureSec(ms: number): string {
  const d = new Date(ms)
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
}

/** « 28/08 13:00 » — the legacy `LIB_Horaires` format. */
export function fmtJourHeure(ms: number | string): string {
  const d = new Date(ms)
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** « 28/08/2026 17:30 » */
export function fmtDateHeure(ms: number | null): string {
  if (ms === null) return '—'
  const d = new Date(ms)
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** « 44 min 52 s » under an hour, « 1 h 05 » beyond — the legacy bubble of
 *  a stop was « N min N sec ». */
export function fmtDuree(s: number): string {
  const sec = Math.max(0, Math.round(s))
  if (sec < 60) return `${sec} s`
  if (sec < 3600) return `${Math.floor(sec / 60)} min ${p2(sec % 60)} s`
  return `${Math.floor(sec / 3600)} h ${p2(Math.floor((sec % 3600) / 60))}`
}

/** « 7 h 06 » — hours and minutes, for the roster and the ⓘ dialog. */
export function fmtHeuresMin(s: number): string {
  const min = Math.max(0, Math.round(s / 60))
  return `${Math.floor(min / 60)} h ${p2(min % 60)}`
}

/** « Total : 21 Heures 12 min » — the legacy `LIB_Total` string, verbatim. */
export function fmtTotalHeures(s: number): string {
  const min = Math.max(0, Math.round(s / 60))
  return `Total : ${Math.floor(min / 60)} Heures ${min % 60} min`
}

/** « 212 kg » / « 262,4 kg » — one decimal only when it carries something. */
export function fmtKg(kg: number): string {
  return `${fmtNum(kg, Number.isInteger(Math.round(kg * 10) / 10) ? 0 : 1)} kg`
}

/** « 87 % » (ratio in) */
export function fmtPct(ratio: number | null): string {
  return ratio === null ? '—' : `${Math.round(ratio * 100)} %`
}

/** The legacy `LIB_Équipe` captions. */
export function libelleEquipe(nom: EquipeNom): string {
  if (nom === 'Matin') return 'Équipe du Matin'
  if (nom === 'Après-Midi') return 'Équipe de l’après-midi'
  return 'Équipe de nuit'
}

// ── Time scale of the timeline ───────────────────────────

/** Width of a piece event on the legacy timeline: 420 s. */
export const LARGEUR_EVENEMENT_MS = 7 * 60_000
/** A mark never gets thinner than this, so a 1-minute stop stays visible. */
export const MARQUE_MIN_PX = 3
/** Hover / focus target of a mark, at least this wide (dataviz: ≥ 24 px). */
export const CIBLE_MIN_PX = 24

export interface Echelle {
  /** ms → px, clamped to [0, largeur]. */
  x: (ms: number) => number
  /** Hourly graduations, both ends included. */
  ticks: { ms: number; x: number; label: string }[]
  largeur: number
}

/** The whole shift fits the width (user decision: no zoom, no scroll). */
export function echelleEquipe(debutMs: number, finMs: number, largeur: number): Echelle {
  const duree = Math.max(1, finMs - debutMs)
  const x = (ms: number) => Math.min(largeur, Math.max(0, ((ms - debutMs) / duree) * largeur))
  const ticks: Echelle['ticks'] = []
  const first = new Date(debutMs)
  first.setMinutes(0, 0, 0)
  if (first.getTime() < debutMs) first.setHours(first.getHours() + 1)
  for (let d = new Date(first); d.getTime() <= finMs; d.setHours(d.getHours() + 1)) {
    ticks.push({ ms: d.getTime(), x: x(d.getTime()), label: `${d.getHours()}h` })
  }
  return { x, ticks, largeur }
}

/** Left edge and width of a mark on the scale, never thinner than
 *  MARQUE_MIN_PX and never past the right edge. */
export function rectMarque(e: Echelle, debutMs: number, finMs: number): { x: number; w: number } {
  const x0 = e.x(debutMs)
  const w = Math.max(MARQUE_MIN_PX, e.x(finMs) - x0)
  return { x: Math.min(x0, Math.max(0, e.largeur - w)), w }
}

/** The hit target around a mark — the mark widened to CIBLE_MIN_PX, centred,
 *  kept inside the scale. */
export function rectCible(e: Echelle, x: number, w: number): { x: number; w: number } {
  if (w >= CIBLE_MIN_PX) return { x, w }
  const cx = x + w / 2
  const x0 = Math.min(Math.max(0, cx - CIBLE_MIN_PX / 2), Math.max(0, e.largeur - CIBLE_MIN_PX))
  return { x: x0, w: Math.min(CIBLE_MIN_PX, e.largeur) }
}

// ── Colours ──────────────────────────────────────────────

/** Value text on a white surface. */
export const TEINTE_TEXT: Record<Teinte, string> = {
  vert: 'text-emerald-700',
  ambre: 'text-amber-600',
  rouge: 'text-red-700',
}

/** Solid verdict pill (white on the ladder colour). */
export const TEINTE_PILL: Record<Teinte, string> = {
  vert: 'bg-emerald-600 text-white',
  ambre: 'bg-amber-500 text-white',
  rouge: 'bg-red-600 text-white',
}

/** §7 status-card tones for the ⓘ dialog's verdict tiles. */
export const TEINTE_CARD: Record<Teinte, { edge: string; iconBg: string; icon: string; value: string }> = {
  vert: { edge: 'border-l-emerald-500/60', iconBg: 'bg-emerald-500/10', icon: 'text-emerald-600', value: 'text-emerald-700' },
  ambre: { edge: 'border-l-amber-400/60', iconBg: 'bg-amber-400/10', icon: 'text-amber-600', value: 'text-amber-600' },
  rouge: { edge: 'border-l-red-500/60', iconBg: 'bg-red-500/10', icon: 'text-red-600', value: 'text-red-700' },
}

/** The timeline's marks, one colour per series (legend + tooltips carry the
 *  identity, never colour alone). Raw Tailwind values, theme-stable. */
export const COULEURS_TIMELINE = {
  marche: '#10b981', // emerald-500
  arret: '#ffffff',
  rail: '#e4e4e7', // zinc-200
  evenement: '#143D6B', // navy — the legacy « bleu foncé »
  debutOf: '#18181b', // zinc-900 — the legacy black launch
  finOf: '#b91c1c', // red-700 — the legacy « rouge foncé »
  maintenant: '#F2B80A',
  sansAutomate: '#f4f4f5', // zinc-100
} as const
