// The rules the info dialog explains — in ONE place, so the words on the
// wall and the numbers in the calculation cannot drift apart.
//
// The deductions MIRROR the MPS API (`ETM/apps/api/src/lib/trs-trm.ts`:
// `FORFAIT_MIN`, `INTERVENTION_MAX_S`), which is the authority — the API
// computes, this app only displays. `regles.test.ts` imports that file and
// fails the moment the two disagree; the colour ladders are pinned against
// `affichage.ts` the same way. Change the API first, then here.
//
// The legacy comment (FI_TRS) states the allowances GROSS — « nettoyage 4 min
// sans lycra, 7 avec ; fin de pièce 6 min, 9 avec » — and then subtracts the
// one minute already granted to the machine stop that accompanies the
// event. The API stores the net figures (3/6, 5/8); the operator lives the
// gross ones, so the dialog shows `intervention + forfait`.

/** Max intervention time deducted per machine stop, in minutes.
 *
 *  Challenged and CONFIRMED by the user on 2026-08-28: the « temps de
 *  production possible » is what an atelier of ideal, very experienced
 *  bonnetiers would achieve, fixing things as fast as practically possible —
 *  one minute is the walk-and-restart, and the diagnosis/repair time is
 *  exactly what the TRS is meant to measure (the arrêts pill shows the count).
 *  Not to be confused with the tile's 5-minute red step (`affichage.ts`),
 *  which is a reliability threshold against false red cards. */
export const INTERVENTION_MAX_MIN = 1

/** Net allowances, in minutes, ON TOP of the machine stop's minute. */
export const FORFAIT_MIN = {
  nettoyage: { sans: 3, lycra: 6 },
  finPiece: { sans: 5, lycra: 8 },
} as const

/** What the operator is granted in total for the event, stop included. */
export const FORFAIT_TOTAL_MIN = {
  nettoyage: {
    sans: INTERVENTION_MAX_MIN + FORFAIT_MIN.nettoyage.sans,
    lycra: INTERVENTION_MAX_MIN + FORFAIT_MIN.nettoyage.lycra,
  },
  finPiece: {
    sans: INTERVENTION_MAX_MIN + FORFAIT_MIN.finPiece.sans,
    lycra: INTERVENTION_MAX_MIN + FORFAIT_MIN.finPiece.lycra,
  },
} as const

/** The three shifts, legacy boundaries (`equipeCourante` in the API). */
export const EQUIPES = [
  { nom: 'Matin', debut: '5 h', fin: '13 h' },
  { nom: 'Après-midi', debut: '13 h', fin: '21 h' },
  { nom: 'Nuit', debut: '21 h', fin: '5 h' },
] as const

/** Colour ladders as the tile applies them (`affichage.ts`). */
export const SEUILS = {
  /** TRS ratio: red at or under, amber at or under, green above. */
  trs: { rouge: 0.8, ambre: 0.9 },
  /** Arrêts count: green up to, amber up to, red beyond. */
  arrets: { vert: 1, ambre: 5 },
  /** Speed / target ratio: green from, amber from, red below. */
  vitesse: { vert: 0.9, ambre: 0.75 },
  /** Minutes a stopped métier stays amber before turning red. */
  depuisRougeMin: 5,
} as const

/** How often the wall re-reads the parc, seconds (Atelier.tsx `POLL_MS`). */
export const LECTURE_S = 10
