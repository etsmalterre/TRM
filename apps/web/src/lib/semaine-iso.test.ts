// Pins the week number of Atelier › Planning. The grid starts on Sunday and
// the label must be the ISO week of its Monday — the number the legacy screen
// and the printed PDF show. LIVA #1166 / #1167: 2026 read one week too low.

import { describe, expect, it } from 'vitest'
import { isoWeekNumber, semaineDeLaGrille } from './semaine-iso'

describe('isoWeekNumber', () => {
  it('2026: 4 January is a Sunday, still ISO week 1', () => {
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1)
    expect(isoWeekNumber(new Date(2026, 0, 4))).toBe(1)
    expect(isoWeekNumber(new Date(2026, 0, 5))).toBe(2)
  })
  it('a year with 53 weeks (2026) and a year starting mid-week 53 (2027)', () => {
    expect(isoWeekNumber(new Date(2026, 11, 28))).toBe(53)
    expect(isoWeekNumber(new Date(2027, 0, 3))).toBe(53)
    expect(isoWeekNumber(new Date(2027, 0, 4))).toBe(1)
  })
  it('a plain mid-year Monday', () => {
    expect(isoWeekNumber(new Date(2025, 8, 15))).toBe(38)
  })
})

describe('semaineDeLaGrille (Sunday-start grid week)', () => {
  it('week of Sunday 13 Sept 2026 is week 38, not 37 (#1166)', () => {
    expect(semaineDeLaGrille(new Date(2026, 8, 13))).toBe(38)
  })
  it("week of Sunday 27 Sept 2026 is week 40, not 39 (#1167's capture)", () => {
    expect(semaineDeLaGrille(new Date(2026, 8, 27))).toBe(40)
  })
  it('the grid week whose Sunday is 4 Jan 2026 is week 2', () => {
    expect(semaineDeLaGrille(new Date(2026, 0, 4))).toBe(2)
  })
  it('years where the old anchor happened to work still agree', () => {
    expect(semaineDeLaGrille(new Date(2025, 8, 14))).toBe(38)
    expect(semaineDeLaGrille(new Date(2027, 8, 12))).toBe(37)
  })
  it('last grid week of 2026 is week 53; the next one is week 1 of 2027', () => {
    expect(semaineDeLaGrille(new Date(2026, 11, 27))).toBe(53)
    expect(semaineDeLaGrille(new Date(2027, 0, 3))).toBe(1)
  })
})
