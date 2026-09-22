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
  { id: 'perso', libelle: 'Personnaliser' },
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

/** Minutes as the legacy MinToFormat (COL_ProcéduresGlobales) writes them:
 *  « HH:MM », hours on two digits at least, negatives « -HH:MM » — the lissage
 *  totals and the annual balance. */
export function heuresMinutes(min: number): string {
  const total = Math.round(min)
  const a = Math.abs(total)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${total < 0 ? '-' : ''}${p2(Math.floor(a / 60))}:${p2(a % 60)}`
}

/** « +23:00 » / « -02:30 » — a balance always carries its sign. */
export function soldeSigne(min: number): string {
  return min > 0 ? `+${heuresMinutes(min)}` : heuresMinutes(min)
}

/** « HH:MM » typed by hand → minutes, null when malformed. */
export function minutesDepuisHM(v: string): number | null {
  const m = /^\s*(\d{1,3}):([0-5]\d)\s*$/.exec(v)
  return m ? +m[1] * 60 + +m[2] : null
}

/** « +10:00 » / « -7:00 » / « 35:00 » typed by hand → signed minutes, null when malformed
 *  (the legacy Variables accepted « (-)H:MM »). */
export function minutesSignees(v: string): number | null {
  const m = /^\s*([+-]?)(\d{1,4}):([0-5]\d)\s*$/.exec(v)
  if (!m) return null
  const n = +m[2] * 60 + +m[3]
  return m[1] === '-' ? -n : n
}

/** ISO week (year + number) of a `YYYYMMDD` day — the numbering of the lissage sheets. */
export function semaineIsoDe(jour: string): { annee: number; numero: number } {
  const d = new Date(midi(jour))
  const js = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - js)
  const annee = d.getUTCFullYear()
  const numero = Math.ceil(((d.getTime() - Date.UTC(annee, 0, 1)) / 86_400_000 + 1) / 7)
  return { annee, numero }
}

/** The ISO weeks the previous month spans — payroll is done for the month just ended. */
export function semainesDuMoisPrecedent(aujourdhui: string): { annee: number; du: number; au: number } {
  const { du, au } = bornesPeriode('mois_prec', aujourdhui)
  const a = semaineIsoDe(du)
  const b = semaineIsoDe(au)
  // a month straddling two ISO years (early January) is asked in the year of its last week
  return a.annee === b.annee ? { annee: a.annee, du: a.numero, au: b.numero } : { annee: b.annee, du: 1, au: b.numero }
}
