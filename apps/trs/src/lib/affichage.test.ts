import { describe, it, expect } from 'vitest'
import { teinteTrs, teinteArrets, teinteVitesse, teinteDepuis, fmtArrets, fmtDuree, fmtPct } from './affichage'

describe('teinteTrs — FI_TRS ladder', () => {
  it('is red up to 80 %, amber up to 90 %, green above', () => {
    expect(teinteTrs(0.8)).toBe('rouge')
    expect(teinteTrs(0.81)).toBe('ambre')
    expect(teinteTrs(0.9)).toBe('ambre')
    expect(teinteTrs(0.91)).toBe('vert')
    expect(teinteTrs(1.15)).toBe('vert')
  })
})

describe('teinteArrets — mean per piece, the tablet photo read per piece', () => {
  it('≤ 1 green, ≤ 3 amber, above red', () => {
    expect(teinteArrets(0)).toBe('vert')
    expect(teinteArrets(1)).toBe('vert')
    expect(teinteArrets(1.3)).toBe('ambre')
    expect(teinteArrets(3)).toBe('ambre')
    expect(teinteArrets(3.3)).toBe('rouge')
    expect(teinteArrets(9)).toBe('rouge')
  })
})

describe('fmtArrets', () => {
  it('one decimal at most, French comma, — when there is no finished piece', () => {
    expect(fmtArrets(null)).toBe('—')
    expect(fmtArrets(0)).toBe('0')
    expect(fmtArrets(2)).toBe('2')
    expect(fmtArrets(2.3)).toBe('2,3')
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
