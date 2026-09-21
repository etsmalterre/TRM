// Clock and duration wording of the tablet. Always Europe/Paris, whatever the
// tablet's own zone setting — the API stamps Paris time too.
import type { Ligne, Statut } from '@/lib/pointage-api'

const PARIS = 'Europe/Paris'
const HM = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' })
const SEC = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, second: '2-digit' })
const DATE = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'long', day: 'numeric', month: 'long' })

/** « 08:02 », or « — » for a time not stamped. */
export function heure(ms: number | null | undefined): string {
  return ms == null ? '—' : HM.format(ms)
}

/** « 07 » — the seconds of the clock. */
export function secondes(ms: number): string {
  return SEC.format(ms).padStart(2, '0')
}

/** « mardi 15 septembre ». */
export function dateLongue(ms: number): string {
  return DATE.format(ms)
}

/** A `YYYYMMDD` day as « lundi 14 septembre » (noon UTC: never crosses a day). */
export function jourLong(jour: string): string {
  return DATE.format(Date.UTC(+jour.slice(0, 4), +jour.slice(4, 6) - 1, +jour.slice(6, 8), 12))
}

const JOUR_COURT = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'short', day: '2-digit', month: '2-digit' })

/** A `YYYYMMDD` day as « lun. 14/09 » — an arrival that is not today's. */
export function jourCourt(jour: string): string {
  return JOUR_COURT.format(Date.UTC(+jour.slice(0, 4), +jour.slice(4, 6) - 1, +jour.slice(6, 8), 12))
}

/** Minutes as the legacy MinToFormat (COL_ProcéduresGlobales) writes them:
 *  « HH:MM », hours padded to two digits (never cut past two), negatives
 *  « -HH:MM » — « 36:15 », « -02:30 », « 00:00 ». */
export function heuresMinutes(min: number): string {
  const total = Math.round(min)
  const a = Math.abs(total)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${total < 0 ? '-' : ''}${p2(Math.floor(a / 60))}:${p2(a % 60)}`
}

/** The annualised-hours balance (« Solde annuel »), always signed so a credit
 *  is as visible as a debt: « +02:30 », « -00:30 », « 00:00 » when even. */
export function soldeSigne(min: number): string {
  const s = heuresMinutes(min)
  return Math.round(min) > 0 ? `+${s}` : s
}

/** Green in credit, amber when hours are owed, plain when even. */
export function soldeClasse(min: number): string {
  const total = Math.round(min)
  if (total > 0) return 'text-success'
  if (total < 0) return 'text-amber-700'
  return 'text-foreground'
}

/** When the current status began: the start of the running pause, or the
 *  latest return to work (arrival or end of a pause). */
export function debutStatut(statut: Statut, ligne: Ligne | null): number | null {
  if (!ligne) return null
  if (statut === 'en_pause') return ligne.debutPause2Ms ?? ligne.debutPause1Ms
  const t = Math.max(ligne.debutMs ?? 0, ligne.finPause1Ms ?? 0, ligne.finPause2Ms ?? 0)
  return t > 0 ? t : null
}

/** « Au travail depuis 08:02 » · « En pause depuis 10:15 » · « Pas au travail ». */
export function phraseStatut(statut: Statut, ligne: Ligne | null): string {
  const t = debutStatut(statut, ligne)
  if (statut === 'au_travail') return t ? `Au travail depuis ${heure(t)}` : 'Au travail'
  if (statut === 'en_pause') return t ? `En pause depuis ${heure(t)}` : 'En pause'
  return 'Pas au travail'
}
