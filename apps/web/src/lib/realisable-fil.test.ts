import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, sep } from 'node:path'
import { realisableSurFil } from './realisable-fil'
// The API file itself — ETM is a mandatory sibling checkout (CLAUDE.md
// § Shared screens). The web's « Finir le fil » estimate and the API's
// Réalisable bar must be one rule, so the copy is checked against the
// original here. From a paired worktree, `ETM_API_REALISABLE_TRM` points the
// import at the NG worktree's copy until the NG branch lands:
//   ETM_API_REALISABLE_TRM=C:/dev/etsmalterre/ETM-debug-1/apps/api/src/lib/realisable-fil-trm.ts pnpm test
// Resolved from THIS file, not from the Vite root: a plain relative string in
// a dynamic import is resolved against `apps/web`, which five levels up is the
// drive root — the test then failed on `Cannot find module '/ETM/…'` (2026-09-11).
const etmApiLib = (name: string) =>
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../ETM/apps/api/src/lib', name + '.ts').replaceAll(sep, '/')
const { realisableSurLots } = await import(
  /* @vite-ignore */ process.env.ETM_API_REALISABLE_TRM ?? etmApiLib('realisable-fil-trm')
)

// LIVA #1147 — OF 3574 on 2026-09-11: lot 10546 (380 Kg) at 90 %, lot 10521
// (422,48 Kg) at 10 %; the pair total of COTON PEIGNE Z écru was 2 226,75 Kg.
const CASES: Array<Array<{ IDstock_fil: number; lot_stock: number; pourcentage: number }>> = [
  [{ IDstock_fil: 10546, lot_stock: 380, pourcentage: 90 }, { IDstock_fil: 10521, lot_stock: 422.48, pourcentage: 10 }],
  [{ IDstock_fil: 1, lot_stock: 1000, pourcentage: 90 }, { IDstock_fil: 2, lot_stock: 5, pourcentage: 10 }],
  [{ IDstock_fil: 7, lot_stock: 100, pourcentage: 50 }, { IDstock_fil: 7, lot_stock: 100, pourcentage: 50 }],
  [{ IDstock_fil: 0, lot_stock: 500, pourcentage: 50 }, { IDstock_fil: 3, lot_stock: 20, pourcentage: 50 }],
  [{ IDstock_fil: 3, lot_stock: -12, pourcentage: 100 }],
  [{ IDstock_fil: 0, lot_stock: 500, pourcentage: 100 }],
  [],
]

describe('realisableSurFil is the API’s realisableSurLots', () => {
  it('bounded by the chosen lot, not the pair', () => {
    expect(realisableSurFil(CASES[0])).toBeCloseTo(380 / 0.9, 2)
  })
  it('same answer as the API on every fixture', () => {
    for (const rows of CASES) expect(realisableSurFil(rows)).toBe(realisableSurLots(rows))
  })
  it('accepts the draft’s typed percentages (comma decimal, blank)', () => {
    expect(realisableSurFil([
      { IDstock_fil: 1, lot_stock: 90, pourcentage: '90,0' },
      { IDstock_fil: 2, lot_stock: 100, pourcentage: '' },
    ])).toBeCloseTo(100, 6)
  })
})
