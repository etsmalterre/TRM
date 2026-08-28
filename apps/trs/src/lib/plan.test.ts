import { describe, it, expect } from 'vitest'
import { placer, RANGEE_HAUT, RANGEES_BAS, EMPLACEMENTS_VIDES } from './plan'
import type { TrsMachine } from './trs-api'

const machine = (emplacement: string): TrsMachine => ({
  id: emplacement.charCodeAt(0) * 100 + emplacement.charCodeAt(1),
  emplacement,
  etat: 1,
  depuisMs: null,
  vitesse: 0,
  enProduction: false,
  of: null,
  trs: null,
  arrets: 0,
  arretsParHeure: 0,
  tempsProdS: 0,
  tempsMarcheS: 0,
  deductibleS: 0,
})

// The 30 live métiers as the base holds them on 2026-08-28.
const PARC = [
  ...'ACDEFGHIJ'.split('').map((c) => `1${c}`),
  ...'ABCDEFGHIJ'.split('').map((c) => `2${c}`),
  ...'ABCDEFGHIJK'.split('').map((c) => `3${c}`),
].map(machine)

describe('placer', () => {
  it('lays out 11 + 10 + 10 slots, row 3 on top', () => {
    const p = placer(PARC)
    expect(p.haut.map((s) => s.code)).toEqual([...RANGEE_HAUT])
    expect(p.bas.map((r) => r.map((s) => s.code))).toEqual(RANGEES_BAS.map((r) => [...r]))
  })

  it('seats every one of the 30 métiers and leaves 1B empty', () => {
    const p = placer(PARC)
    const seated = [...p.haut, ...p.bas.flat()].filter((s) => s.machine !== null)
    expect(seated).toHaveLength(30)
    const b1 = p.bas[1].find((s) => s.code === '1B')!
    expect(b1.machine).toBeNull()
    expect(EMPLACEMENTS_VIDES.has('1B')).toBe(true)
    expect(p.horsPlan).toEqual([])
  })

  it('marks the two walkways after B and H on the lower rows only', () => {
    const p = placer(PARC)
    for (const row of p.bas) {
      expect(row.filter((s) => s.alleeApres).map((s) => s.code.slice(1))).toEqual(['B', 'H'])
    }
    expect(p.haut.some((s) => s.alleeApres)).toBe(false)
  })

  it('reports a métier whose emplacement is not on the plan instead of dropping it', () => {
    const p = placer([...PARC, machine('4A')])
    expect(p.horsPlan.map((m) => m.emplacement)).toEqual(['4A'])
  })

  it('matches emplacements case- and space-insensitively', () => {
    const p = placer([machine(' 3k ')])
    expect(p.haut.find((s) => s.code === '3K')!.machine).not.toBeNull()
  })
})
