// Clock wording and period presets of the menu « Pointage ». Always
// Europe/Paris, whatever the browser's zone — the API stamps Paris time too
// (mirrors apps/pointage/src/lib/heures.ts for the shared formatters).

const PARIS = 'Europe/Paris'
const HM = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' })
const JOUR_LONG = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const JOUR_COURT = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'short', day: '2-digit', month: '2-digit' })
const JOUR_NUM = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, day: '2-digit', month: '2-digit', year: 'numeric' })
const YMD = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' })

/** « 08:02 », or « — » for a time not stamped. */
export function heure(ms: number | null | undefined): string {
  return ms == null ? '—' : HM.format(ms)
}

/** « 08:02 » or '' — the value of a `<input type="time">`. */
export function heureSaisie(ms: number | null | undefined): string {
  return ms == null ? '' : HM.format(ms)
}

/** Noon UTC of a `YYYYMMDD` day — a Date that never crosses the day in any zone. */
function midi(jour: string): number {
  return Date.UTC(+jour.slice(0, 4), +jour.slice(4, 6) - 1, +jour.slice(6, 8), 12)
}

/** « lundi 21 septembre 2026 ». */
export const jourLong = (jour: string) => JOUR_LONG.format(midi(jour))
/** « lun. 21/09 ». */
export const jourCourt = (jour: string) => JOUR_COURT.format(midi(jour))
/** « 21/09/2026 ». */
export const jourNum = (jour: string) => JOUR_NUM.format(midi(jour))

/** Minutes as « H:MM » — the legacy grid's `cumul_presence` (hours not padded). */
export function dureeHM(min: number | null | undefined): string {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Paris day of an instant as `YYYYMMDD`. */
export function jourDe(ms: number): string {
  return YMD.format(ms).replace(/-/g, '')
}

/** `YYYY-MM-DD` ⇄ `YYYYMMDD` for `<input type="date">`. */
export const jourVersInput = (jour: string) => (jour ? `${jour.slice(0, 4)}-${jour.slice(4, 6)}-${jour.slice(6, 8)}` : '')
export const inputVersJour = (v: string) => v.replace(/-/g, '')

function decale(jour: string, jours: number): string {
  const t = new Date(midi(jour) + jours * 86_400_000)
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}`
}

/** Monday of the week holding `jour` (ISO week, Monday first). */
function lundiDe(jour: string): string {
  const d = new Date(midi(jour))
  const js = d.getUTCDay() || 7 // 1 = Monday … 7 = Sunday
  return decale(jour, 1 - js)
}

export type Periode = 'semaine' | 'semaine_prec' | 'mois' | 'mois_prec' | 'trente_jours' | 'perso'

export const PERIODES: { id: Periode; libelle: string }[] = [
  { id: 'semaine', libelle: 'Cette semaine' },
  { id: 'semaine_prec', libelle: 'Semaine dernière' },
  { id: 'mois', libelle: 'Ce mois' },
  { id: 'mois_prec', libelle: 'Mois dernier' },
  { id: 'trente_jours', libelle: '30 derniers jours' },
  { id: 'perso', libelle: 'Période libre' },
]

/** `du` / `au` (`YYYYMMDD`, inclusive) of a preset, seen from `aujourdhui`.
 *  A week runs Monday to Sunday, like the lissage sheets. */
export function bornesPeriode(p: Exclude<Periode, 'perso'>, aujourdhui: string): { du: string; au: string } {
  switch (p) {
    case 'semaine': {
      const du = lundiDe(aujourdhui)
      return { du, au: decale(du, 6) }
    }
    case 'semaine_prec': {
      const du = decale(lundiDe(aujourdhui), -7)
      return { du, au: decale(du, 6) }
    }
    case 'mois': {
      const du = `${aujourdhui.slice(0, 6)}01`
      return { du, au: finDeMois(du) }
    }
    case 'mois_prec': {
      const du = `${decale(`${aujourdhui.slice(0, 6)}01`, -1).slice(0, 6)}01`
      return { du, au: finDeMois(du) }
    }
    case 'trente_jours':
      return { du: decale(aujourdhui, -29), au: aujourdhui }
  }
}

function finDeMois(premier: string): string {
  const y = +premier.slice(0, 4)
  const m = +premier.slice(4, 6)
  const dernier = new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month
  return `${premier.slice(0, 6)}${String(dernier).padStart(2, '0')}`
}
