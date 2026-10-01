import { describe, it, expect } from 'vitest'
import { fermetures, ordreApresDepot, joursEntre, fmtDuree } from './planning-prod'

const d = (day: number, h = 0) => new Date(2026, 9, day, h).getTime()

describe('fermetures', () => {
  it('is the complement of the worked windows inside the span', () => {
    const ouvert = [{ debut: d(5, 5), fin: d(5, 21) }, { debut: d(6, 5), fin: d(6, 21) }]
    expect(fermetures(ouvert, d(5), d(7))).toEqual([
      { debut: d(5), fin: d(5, 5) },
      { debut: d(5, 21), fin: d(6, 5) },
      { debut: d(6, 21), fin: d(7) },
    ])
  })
  it('a span fully worked has no closure', () => {
    expect(fermetures([{ debut: d(1), fin: d(9) }], d(2), d(3))).toEqual([])
  })
})

describe('ordreApresDepot', () => {
  const segs = [
    { id: 1, debut: d(5, 0), fin: d(5, 10) },  // middle 05:00
    { id: 2, debut: d(5, 10), fin: d(5, 20) }, // middle 15:00
    { id: 3, debut: d(5, 20), fin: d(6, 6) },  // middle 01:00 next day
  ]
  it('inserts before the first segment whose middle is right of the drop', () => {
    expect(ordreApresDepot(segs, 9, d(5, 12))).toEqual([1, 9, 2, 3])
    expect(ordreApresDepot(segs, 9, d(4))).toEqual([9, 1, 2, 3])
    expect(ordreApresDepot(segs, 9, d(8))).toEqual([1, 2, 3, 9])
  })
  it('moving a segment within its own métier reorders it', () => {
    expect(ordreApresDepot(segs, 3, d(5, 1))).toEqual([3, 1, 2])
    expect(ordreApresDepot(segs, 1, d(7))).toEqual([2, 3, 1])
  })
})

describe('joursEntre', () => {
  it('lists local midnights', () => {
    expect(joursEntre(d(5, 13), d(8))).toEqual([d(5), d(6), d(7)])
  })
})

describe('fmtDuree', () => {
  it('reads like a planner', () => {
    expect(fmtDuree(45)).toBe('45 min')
    expect(fmtDuree(320)).toBe('5 h 20')
    expect(fmtDuree(60 * 28)).toBe('1 j 4 h')
  })
})
