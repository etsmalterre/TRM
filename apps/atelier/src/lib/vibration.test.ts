import { describe, expect, it, vi } from 'vitest'
import { MOTIFS, vibrer } from './vibration'

describe('vibrer — one helper, three feels', () => {
  it('plays the pattern of each moment', () => {
    const vibrate = vi.fn(() => true)
    vibrer('confirme', { vibrate })
    vibrer('refuse', { vibrate })
    vibrer('tick', { vibrate })
    expect(vibrate.mock.calls).toEqual([[MOTIFS.confirme], [MOTIFS.refuse], [MOTIFS.tick]])
  })

  it('tells a refusal from a confirmation by rhythm, not length', () => {
    expect(typeof MOTIFS.confirme).toBe('number')
    expect(Array.isArray(MOTIFS.refuse) && MOTIFS.refuse.length).toBe(3)
    expect(MOTIFS.tick).toBeLessThan(MOTIFS.confirme as number)
  })

  it('does nothing where the API is missing (desktop, iOS)', () => {
    expect(() => vibrer('confirme', {})).not.toThrow()
    expect(() => vibrer('confirme', undefined)).not.toThrow()
  })

  it('swallows a vibration the browser refuses', () => {
    const vibrate = vi.fn(() => {
      throw new Error('blocked')
    })
    expect(() => vibrer('refuse', { vibrate })).not.toThrow()
  })
})
