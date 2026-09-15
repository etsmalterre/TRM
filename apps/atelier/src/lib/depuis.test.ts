import { describe, expect, it } from 'vitest'
import { depuis, DEPUIS_MAX_JOURS } from './depuis'

const MIN = 60_000
const H = 60 * MIN
const J = 24 * H
// 2026-09-15 14:00 local, whatever the machine's zone.
const NOW = new Date(2026, 8, 15, 14, 0, 0).getTime()

describe('depuis — the ladder of an idle tile', () => {
  it('reads « — » on an unknown stamp', () => {
    expect(depuis(null, NOW)).toBe('—')
  })
  it('climbs minutes → hours → days, floored', () => {
    expect(depuis(NOW - 20_000, NOW)).toBe("à l'instant")
    expect(depuis(NOW - 20 * MIN, NOW)).toBe('il y a 20 min')
    expect(depuis(NOW - 59 * MIN - 59_000, NOW)).toBe('il y a 59 min')
    expect(depuis(NOW - 5 * H - 30 * MIN, NOW)).toBe('il y a 5 h')
    expect(depuis(NOW - 3 * J - 2 * H, NOW)).toBe('il y a 3 j')
    expect(depuis(NOW - DEPUIS_MAX_JOURS * J, NOW)).toBe(`il y a ${DEPUIS_MAX_JOURS} j`)
  })
  it('gives the date once it is history', () => {
    const stamp = new Date(2025, 10, 29, 17, 19).getTime()
    expect(depuis(stamp, NOW)).toBe('le 29/11/2025')
  })
})
