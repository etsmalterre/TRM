import { describe, it, expect } from 'vitest'
import { placer, RANGEES_HAUT, RANGEE_BAS, EMPLACEMENTS_VIDES } from './plan'
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
  arretsParPiece: null,
  arretsPieces: 0,
  arretsEquipe: 0,
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
  it('lays out 10 + 10 slots on top and 11 along the bottom', () => {
    const p = placer(PARC)
    expect(p.haut.map((r) => r.map((s) => s.code))).toEqual(RANGEES_HAUT.map((r) => [...r]))
    expect(p.bas.map((s) => s.code)).toEqual([...RANGEE_BAS])
  })

  it('is the floor seen from the other side: 1A top-right, row 3 at the bottom, read J → A', () => {
    const p = placer(PARC)
    // Top-right corner of the screen is the last slot of the first row.
    expect(p.haut[0][p.haut[0].length - 1].code).toBe('1A')
    expect(p.haut[0][0].code).toBe('1J')
    expect(p.haut[1][0].code).toBe('2J')
    expect(p.bas[0].code).toBe('3K')
    expect(p.bas[p.bas.length - 1].code).toBe('3A')
    // The two top rows are the same columns in the same order.
    expect(p.haut[0].map((s) => s.code.slice(1))).toEqual(p.haut[1].map((s) => s.code.slice(1)))
  })

  it('seats every one of the 30 métiers and leaves 1B empty', () => {
    const p = placer(PARC)
    const seated = [...p.haut.flat(), ...p.bas].filter((s) => s.machine !== null)
    expect(seated).toHaveLength(30)
    const b1 = p.haut[0].find((s) => s.code === '1B')!
    expect(b1.machine).toBeNull()
    expect(EMPLACEMENTS_VIDES.has('1B')).toBe(true)
    expect(p.horsPlan).toEqual([])
  })

  it('marks the two walkways after I and C (the floor’s "after B and H", mirrored) on the top rows only', () => {
    const p = placer(PARC)
    for (const row of p.haut) {
      expect(row.filter((s) => s.alleeApres).map((s) => s.code.slice(1))).toEqual(['I', 'C'])
    }
    expect(p.bas.some((s) => s.alleeApres)).toBe(false)
  })

  it('reports a métier whose emplacement is not on the plan instead of dropping it', () => {
    const p = placer([...PARC, machine('4A')])
    expect(p.horsPlan.map((m) => m.emplacement)).toEqual(['4A'])
  })

  it('matches emplacements case- and space-insensitively', () => {
    const p = placer([machine(' 3k ')])
    expect(p.bas.find((s) => s.code === '3K')!.machine).not.toBeNull()
  })
})
