// Colour ladder of the « arrêts / pièce » pill on the régleur tile.
//
// ⚠️ This is the TRS tablet's ladder, verbatim (`teinteArrets` in
// apps/trs/src/lib/affichage.ts, an inferred approximation the tablet's ⓘ
// dialog documents as « ≤ 1 · ≤ 3 · > 3 »). The régleur reads the same figure
// on the wall and on the phone, so the two must paint it the same colour —
// decision of 2026-09-14. The parity test imports the TRS file directly; a
// change there fails here, on purpose. Don't edit this ladder alone.

export type TeinteArrets = 'vert' | 'ambre' | 'rouge'

export function teinteArrets(moyenne: number): TeinteArrets {
  if (moyenne <= 1) return 'vert'
  if (moyenne <= 3) return 'ambre'
  return 'rouge'
}
