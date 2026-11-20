import { describe, expect, it } from 'vitest'
import { lireQuantite } from './livraison-rectiligne'

describe('lireQuantite', () => {
  it('reads what people type', () => {
    expect(lireQuantite('26')).toBe(26)
    expect(lireQuantite(' 1 490 ')).toBe(1490)
    expect(lireQuantite('12,5')).toBe(12.5)
    expect(lireQuantite('12.345')).toBe(12.35)
  })
  it('an empty, negative or unreadable field delivers nothing', () => {
    expect(lireQuantite('')).toBe(0)
    expect(lireQuantite(undefined)).toBe(0)
    expect(lireQuantite('-3')).toBe(0)
    expect(lireQuantite('abc')).toBe(0)
  })
})
