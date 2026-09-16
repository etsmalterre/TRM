// ISO 8601 week number (ISO weeks run Monday → Sunday, week 1 holds 4 January).
//
// The Atelier › Planning grid starts on SUNDAY like the legacy screen, so the
// grid week straddles two ISO weeks: its Sunday belongs to the previous one.
// The number shown (and printed by the MPS API's planning PDF) is the ISO week
// of the grid's Monday → Saturday, i.e. of its Thursday.
//
// History (LIVA #1166 / #1167, 2026-09-16): the first version anchored week 1
// on the Sunday-start week containing 4 January. That slides one week late
// whenever 4 January is itself a Sunday (2026, 2037…), so every week of 2026
// read one too low on screen while the PDF, computed server-side, was right.
// Same algorithm as the API's `isoWeekNumber` in `routes/planning-atelier.ts`.

const DAY_MS = 86_400_000

/** ISO week number of the ISO week containing `date` (local calendar date). */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7 // Monday = 1 … Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - day) // Thursday of this ISO week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7)
}

/** Week number displayed for a Sunday-start grid week: the ISO week of its Monday. */
export function semaineDeLaGrille(sunday: Date): number {
  const monday = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 1)
  return isoWeekNumber(monday)
}
