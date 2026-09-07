// Period presets of the « Rapport de production » widget (LIVA #1132).
//
// The legacy FI_Rapport_de_production_période panel asked for four fields —
// date from, time from, date to, time to — and the atelier typed a shift
// (« 05:00 → 13:00 ») most of the time. The presets below are those shifts
// and the calendar periods the office asks for, computed in the BROWSER from
// its own clock (the legacy read the workstation's too) and sent to the API
// as two datetime-local strings. « Personnalisée » keeps the legacy's free
// bounds. Pure and tested: the shift grid is the atelier's 5 h / 13 h / 21 h
// (lib/trs-equipe.ts REGLES.equipes, the API's equipeAt) and an off-by-one
// on a boundary silently moves a shift's rolls to the next one.

export type PeriodeKey =
  | 'equipe' | 'equipe_prec'
  | 'jour' | 'hier'
  | 'semaine' | 'semaine_prec'
  | 'mois' | 'mois_prec'
  | 'perso'

export interface PeriodeDef { key: PeriodeKey; label: string; description: string }

export const PERIODES: readonly PeriodeDef[] = [
  { key: 'equipe', label: 'Équipe en cours', description: 'Depuis le début de l’équipe (5 h, 13 h ou 21 h) jusqu’à sa fin' },
  { key: 'equipe_prec', label: 'Équipe précédente', description: 'L’équipe de 8 h qui vient de se terminer' },
  { key: 'jour', label: 'Aujourd’hui', description: 'De 0 h à minuit, les trois équipes' },
  { key: 'hier', label: 'Hier', description: 'La journée d’hier, de 0 h à minuit' },
  { key: 'semaine', label: 'Cette semaine', description: 'Du lundi 0 h à ce soir minuit' },
  { key: 'semaine_prec', label: 'Semaine dernière', description: 'Du lundi au dimanche de la semaine passée' },
  { key: 'mois', label: 'Ce mois', description: 'Du 1er du mois à ce soir minuit' },
  { key: 'mois_prec', label: 'Mois dernier', description: 'Le mois civil précédent, en entier' },
  { key: 'perso', label: 'Personnalisée', description: 'Deux dates et heures libres, comme dans l’ancien MPS' },
] as const

/** The shift grid, hours. A shift starting at 21 h ends at 5 h the next day. */
export const EQUIPE_DEBUTS = [5, 13, 21] as const

const SHIFT_MS = 8 * 60 * 60 * 1000

/** `YYYY-MM-DDTHH:mm` in local time — the datetime-local input's value and
 *  the API's query shape. Seconds are dropped: the API pads « au » to :59. */
export function toLocalInput(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Start of the shift containing `now` (local). Between 0 h and 5 h that is
 *  yesterday's 21 h shift. */
export function debutEquipe(now: Date): Date {
  const h = now.getHours()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (h >= 21) d.setHours(21)
  else if (h >= 13) d.setHours(13)
  else if (h >= 5) d.setHours(5)
  else { d.setDate(d.getDate() - 1); d.setHours(21) }
  return d
}

function lastMinute(d: Date): Date {
  // « au » is inclusive down to the second on the API side, so the last
  // minute of a period is 23:59 (→ 23:59:59), and a shift ends the minute
  // before the next one starts (12:59 → 12:59:59).
  return new Date(d.getTime() - 60_000)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Monday 0 h of the week containing `d` (ISO week, Monday first). */
function startOfWeek(d: Date): Date {
  const s = startOfDay(d)
  const dow = (s.getDay() + 6) % 7 // Monday = 0
  return addDays(s, -dow)
}

export interface Bornes { du: string; au: string }

/** The bounds of a preset at instant `now`. `perso` has none — the widget
 *  keeps the user's own two values. */
export function bornesPeriode(key: Exclude<PeriodeKey, 'perso'>, now: Date): Bornes {
  switch (key) {
    case 'equipe': {
      const du = debutEquipe(now)
      return { du: toLocalInput(du), au: toLocalInput(lastMinute(new Date(du.getTime() + SHIFT_MS))) }
    }
    case 'equipe_prec': {
      const fin = debutEquipe(now)
      const du = new Date(fin.getTime() - SHIFT_MS)
      return { du: toLocalInput(du), au: toLocalInput(lastMinute(fin)) }
    }
    case 'jour': {
      const du = startOfDay(now)
      return { du: toLocalInput(du), au: toLocalInput(lastMinute(addDays(du, 1))) }
    }
    case 'hier': {
      const du = addDays(startOfDay(now), -1)
      return { du: toLocalInput(du), au: toLocalInput(lastMinute(addDays(du, 1))) }
    }
    case 'semaine': {
      const du = startOfWeek(now)
      return { du: toLocalInput(du), au: toLocalInput(lastMinute(addDays(startOfDay(now), 1))) }
    }
    case 'semaine_prec': {
      const fin = startOfWeek(now)
      return { du: toLocalInput(addDays(fin, -7)), au: toLocalInput(lastMinute(fin)) }
    }
    case 'mois': {
      const du = new Date(now.getFullYear(), now.getMonth(), 1)
      return { du: toLocalInput(du), au: toLocalInput(lastMinute(addDays(startOfDay(now), 1))) }
    }
    case 'mois_prec': {
      const fin = new Date(now.getFullYear(), now.getMonth(), 1)
      const du = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return { du: toLocalInput(du), au: toLocalInput(lastMinute(fin)) }
    }
  }
}

/** « 23/03 05:00 » — the caption under the tiles, so the user always sees
 *  the bounds a preset resolved to. Year only when it is not the current one. */
export function fmtBorne(v: string, now: Date): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return v
  const year = Number(m[1]) === now.getFullYear() ? '' : `/${m[1]}`
  return `${m[3]}/${m[2]}${year} ${m[4]}:${m[5]}`
}
