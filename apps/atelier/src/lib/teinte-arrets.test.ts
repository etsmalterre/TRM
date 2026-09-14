import { describe, expect, it } from 'vitest'
import { teinteArrets } from './teinte-arrets'
// The tablet's own rule — the source, not a copy. Sibling app in the monorepo.
import { teinteArrets as teinteTablette } from '../../../trs/src/lib/affichage'

describe('teinteArrets — same ladder as the TRS tablet', () => {
  it('matches the tablet on every step and both boundaries', () => {
    for (const m of [0, 0.5, 1, 1.01, 2, 2.9, 3, 3.01, 4, 9, 25]) {
      expect(teinteArrets(m), `moyenne ${m}`).toBe(teinteTablette(m))
    }
  })
  it('reads « ≤ 1 · ≤ 3 · > 3 » like the tablet ⓘ dialog', () => {
    expect(teinteArrets(1)).toBe('vert')
    expect(teinteArrets(3)).toBe('ambre')
    expect(teinteArrets(3.5)).toBe('rouge')
  })
})
