// Colour ladders and formatting for the métier tiles.
//
// Status colours only (dataviz: good / warning / critical, reserved, always
// paired with a label — every pill on the tile carries its word). Where a
// ladder comes from the legacy it is quoted; where it is inferred from the
// photo of the legacy tablet (2026-08-28) it is marked as such and listed in
// ~/.claude/plans/trs-atelier.md §4.3 as an approximation to revisit.

export type Teinte = 'vert' | 'ambre' | 'rouge'

/** FI_TRS, verbatim: `<= 0.8` rouge, `<= 0.9` orange, else vert. */
export function teinteTrs(trs: number): Teinte {
  if (trs <= 0.8) return 'rouge'
  if (trs <= 0.9) return 'ambre'
  return 'vert'
}

/** Mean « défaut » stops PER PIECE (the API's `arretsParPiece`). ⚠️ Inferred:
 *  the tablet photo (0 green, 4 and 5 amber, 9 red) showed the legacy's
 *  NombreArrets, which counts over its last 2 pieces — sum or average is
 *  compiled away — so per piece those read roughly ≤ 1 / ≤ 3 / > 3. The
 *  legacy tablet's own ladder is unrecoverable; FI_TRS colours a per-HOUR
 *  count (0–1 / 2 / more) which the tablet visibly does not use. */
export function teinteArrets(moyenne: number): Teinte {
  if (moyenne <= 1) return 'vert'
  if (moyenne <= 3) return 'ambre'
  return 'rouge'
}

/** « 2 », « 2,3 », « — » — one decimal at most, French comma. */
export function fmtArrets(moyenne: number | null): string {
  if (moyenne === null) return '—'
  return moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}

/** Live speed against the reference's target when it has one (the photo
 *  shows 18 green on 1G and 14 red on 3E, so the tablet is relative, not the
 *  absolute `< 20 / < 25` of FI_TRS). ⚠️ The 90 % / 75 % steps are ours.
 *  Without a target, FI_TRS's absolute ladder. */
export function teinteVitesse(vitesse: number, cible: number): Teinte {
  if (cible > 0) {
    const r = vitesse / cible
    if (r >= 0.9) return 'vert'
    if (r >= 0.75) return 'ambre'
    return 'rouge'
  }
  if (vitesse < 20) return 'rouge'
  if (vitesse < 25) return 'ambre'
  return 'vert'
}

/** A stop's age. The 5-minute step is ours (the photo shows 10' and « > 15' »
 *  in red and nothing shorter), confirmed by the user on 2026-08-28 with its
 *  reason: it is a RELIABILITY threshold, not a grant of time — short stops
 *  and PLC glitches must not paint the wall with false red cards. It is
 *  deliberately different from the TRS's 1-minute intervention allowance
 *  (`lib/regles.ts`); the two answer different questions. */
export function teinteDepuis(ms: number): Teinte {
  return ms < 5 * 60_000 ? 'ambre' : 'rouge'
}

/** « 3 min », « 1 h 05 », « 2 j » — a stop on a wall display is read as a
 *  duration, not a clock time. The legacy capped at « > 15' »; a métier down
 *  since yesterday deserves to say so. */
export function fmtDuree(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)} j`
}

export function fmtPct(ratio: number | null): string {
  if (ratio === null) return '—'
  return `${Math.round(ratio * 100)} %`
}

export function fmtHeure(iso: string | null | undefined, secondes = false): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(secondes ? { second: '2-digit' } : {}),
  })
}
