// The floor plan of the knitting workshop — Vincent's drawing of 2026-08-28,
// NOT the legacy tablet (which drew a 1B that never existed and forgot 3K).
//
//   ┌──────────────────────────────────────────────────────┐
//   │ 3A 3B 3C 3D 3E 3F 3G 3H 3I 3J 3K                     │   row 3: eleven
//   ├──────────────────────────────────────────────────────┤   ← allée transversale
//   │ 2A 2B │ 2C 2D 2E 2F 2G 2H │ 2I 2J                    │
//   │ 1A 1B │ 1C 1D 1E 1F 1G 1H │ 1I 1J                    │   1B is an empty slot
//   └───────┴────────────────────┴─────────────────────────┘
//           ↑ two longitudinal walkways: after column B, before column I
//
// Row 3 sits on top and column A is on the LEFT — the mirror of the legacy
// tablet's orientation. Verified against the base the same day: the 30 live
// métiers are exactly 3A…3K (11), 2A…2J (10) and 1A, 1C…1J (9) — there is
// no 1B, and `adresse_automate` 2 is the unused one of the 31.
//
// Slots are keyed by `machine.emplacement`, the code painted on the floor.
// A live métier whose emplacement is not on this plan is NOT dropped: it
// comes back in `horsPlan` so the screen can say so.

import type { TrsMachine } from './trs-api'

/** Row 3, left → right. */
export const RANGEE_HAUT = ['3A', '3B', '3C', '3D', '3E', '3F', '3G', '3H', '3I', '3J', '3K'] as const

/** Rows 2 then 1 (top → bottom), left → right. */
export const RANGEES_BAS = [
  ['2A', '2B', '2C', '2D', '2E', '2F', '2G', '2H', '2I', '2J'],
  ['1A', '1B', '1C', '1D', '1E', '1F', '1G', '1H', '1I', '1J'],
] as const

/** Column letters of RANGEES_BAS after which a longitudinal walkway runs. */
export const ALLEES_APRES = new Set(['B', 'H'])

/** Slots with no métier — a place on the floor, nothing to measure. */
export const EMPLACEMENTS_VIDES = new Set(['1B'])

export interface Emplacement {
  code: string
  machine: TrsMachine | null
  /** True when a walkway runs to the right of this slot (rows 2 and 1 only). */
  alleeApres: boolean
}

export interface Plan {
  haut: Emplacement[]
  bas: Emplacement[][]
  /** Live métiers whose `emplacement` matches no slot. */
  horsPlan: TrsMachine[]
}

export function placer(machines: TrsMachine[]): Plan {
  const parCode = new Map<string, TrsMachine>()
  for (const m of machines) parCode.set(m.emplacement.trim().toUpperCase(), m)
  const vus = new Set<string>()
  const slot = (code: string, bas: boolean): Emplacement => {
    vus.add(code)
    return {
      code,
      machine: parCode.get(code) ?? null,
      alleeApres: bas && ALLEES_APRES.has(code.slice(1)),
    }
  }
  const haut = RANGEE_HAUT.map((c) => slot(c, false))
  const bas = RANGEES_BAS.map((r) => r.map((c) => slot(c, true)))
  const horsPlan = machines.filter((m) => !vus.has(m.emplacement.trim().toUpperCase()))
  return { haut, bas, horsPlan }
}
