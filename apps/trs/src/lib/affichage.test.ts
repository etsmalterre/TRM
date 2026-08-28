import { describe, it, expect } from 'vitest'
import { teinteTrs, teinteArrets, teinteVitesse, teinteDepuis, fmtDuree, fmtPct } from './affichage'

describe('teinteTrs — FI_TRS ladder', () => {
  it('is red up to 80 %, amber up to 90 %, green above', () => {
    expect(teinteTrs(0.8)).toBe('rouge')
    expect(teinteTrs(0.81)).toBe('ambre')
    expect(teinteTrs(0.9)).toBe('ambre')
    expect(teinteTrs(0.91)).toBe('vert')
    expect(teinteTrs(1.15)).toBe('vert')
  })
})

describe('teinteArrets — reproduces the tablet photo', () => {
  it('0 green, 4 and 5 amber, 9 red', () => {
    expect(teinteArrets(0)).toBe('vert')
    expect(teinteArrets(4)).toBe('ambre')
    expect(teinteArrets(5)).toBe('ambre')
    expect(teinteArrets(9)).toBe('rouge')
  })
})

describe('teinteVitesse', () => {
  it('is relative to the target when there is one (18 green on 1G, 14 red on 3E)', () => {
    expect(teinteVitesse(18, 19)).toBe('vert')
    expect(teinteVitesse(14, 22)).toBe('rouge')
    expect(teinteVitesse(17, 20)).toBe('ambre')
  })
  it('falls back to the FI_TRS absolute ladder without a target', () => {
    expect(teinteVitesse(19, 0)).toBe('rouge')
    expect(teinteVitesse(22, 0)).toBe('ambre')
    expect(teinteVitesse(25, 0)).toBe('vert')
  })
})

describe('teinteDepuis', () => {
  it('turns red at five minutes', () => {
    expect(teinteDepuis(4 * 60_000)).toBe('ambre')
    expect(teinteDepuis(5 * 60_000)).toBe('rouge')
  })
})

describe('formatting', () => {
  it('formats durations for a wall display', () => {
    expect(fmtDuree(0)).toBe('0 min')
    expect(fmtDuree(3.9 * 60_000)).toBe('3 min')
    expect(fmtDuree(65 * 60_000)).toBe('1 h 05')
    expect(fmtDuree(49 * 3_600_000)).toBe('2 j')
  })
  it('formats the TRS ratio as a rounded percentage', () => {
    expect(fmtPct(null)).toBe('—')
    expect(fmtPct(1.064)).toBe('106 %')
    expect(fmtPct(0.895)).toBe('90 %')
  })
})
