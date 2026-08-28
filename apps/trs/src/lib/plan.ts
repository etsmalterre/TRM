// The floor plan of the knitting workshop — Vincent's drawing of 2026-08-28,
// NOT the legacy tablet (which drew a 1B that never existed and forgot 3K).
//
// Drawn as the floor is laid out (column A on the left, row 3 at the back):
//
//   ┌──────────────────────────────────────────────────────┐
//   │ 3A 3B 3C 3D 3E 3F 3G 3H 3I 3J 3K                     │   row 3: eleven
//   ├──────────────────────────────────────────────────────┤   ← allée transversale
//   │ 2A 2B │ 2C 2D 2E 2F 2G 2H │ 2I 2J                    │
//   │ 1A 1B │ 1C 1D 1E 1F 1G 1H │ 1I 1J                    │   1B is an empty slot
//   └───────┴────────────────────┴─────────────────────────┘
//           ↑ two longitudinal walkways: after column B, before column I
//
// ON SCREEN THE PLAN IS ROTATED 180° (user's correction, 2026-08-28): the
// tablet hangs on the wall the operator faces with the transversal walkway
// at their back, so what they see is the floor from the other side — 1A in
// the top-right corner, rows 1 then 2 at the top read right-to-left
// (1J … 1A), the transversal walkway under them (towards the viewer), and
// row 3 along the bottom (3K … 3A). A tile is the same tile either way;
// only the order of the slots and the side of the walkways change, which is
// why the rotation lives here and not in CSS (a CSS rotate would flip the
// text too).
//
// Verified against the base the same day: the 30 live métiers are exactly
// 3A…3K (11), 2A…2J (10) and 1A, 1C…1J (9) — there is no 1B, and
// `adresse_automate` 2 is the unused one of the 31.
//
// Slots are keyed by `machine.emplacement`, the code painted on the floor.
// A live métier whose emplacement is not on this plan is NOT dropped: it
// comes back in `horsPlan` so the screen can say so.

import type { TrsMachine } from './trs-api'

/** Rows 1 then 2, top → bottom on screen, each left → right ON SCREEN —
 *  i.e. the floor's column J first and column A last. */
export const RANGEES_HAUT = [
  ['1J', '1I', '1H', '1G', '1F', '1E', '1D', '1C', '1B', '1A'],
  ['2J', '2I', '2H', '2G', '2F', '2E', '2D', '2C', '2B', '2A'],
] as const

/** Row 3, along the bottom of the screen, left → right on screen (3K … 3A). */
export const RANGEE_BAS = ['3K', '3J', '3I', '3H', '3G', '3F', '3E', '3D', '3C', '3B', '3A'] as const

/** Column letters of RANGEES_HAUT after which (to the RIGHT on screen) a
 *  longitudinal walkway runs. On the floor the walkways sit after B and
 *  after H; seen from the other side they sit after I and after C. */
export const ALLEES_APRES = new Set(['I', 'C'])

/** Slots with no métier — a place on the floor, nothing to measure. */
export const EMPLACEMENTS_VIDES = new Set(['1B'])

export interface Emplacement {
  code: string
  machine: TrsMachine | null
  /** True when a walkway runs to the right (on screen) of this slot — rows 1 and 2 only. */
  alleeApres: boolean
}

export interface Plan {
  /** Rows 1 and 2 — the block above the transversal walkway on screen. */
  haut: Emplacement[][]
  /** Row 3 — along the bottom of the screen. */
  bas: Emplacement[]
  /** Live métiers whose `emplacement` matches no slot. */
  horsPlan: TrsMachine[]
}

export function placer(machines: TrsMachine[]): Plan {
  const parCode = new Map<string, TrsMachine>()
  for (const m of machines) parCode.set(m.emplacement.trim().toUpperCase(), m)
  const vus = new Set<string>()
  const slot = (code: string, haut: boolean): Emplacement => {
    vus.add(code)
    return {
      code,
      machine: parCode.get(code) ?? null,
      alleeApres: haut && ALLEES_APRES.has(code.slice(1)),
    }
  }
  const haut = RANGEES_HAUT.map((r) => r.map((c) => slot(c, true)))
  const bas = RANGEE_BAS.map((c) => slot(c, false))
  const horsPlan = machines.filter((m) => !vus.has(m.emplacement.trim().toUpperCase()))
  return { haut, bas, horsPlan }
}
