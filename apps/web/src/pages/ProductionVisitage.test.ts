// Pins the quantity field of a défaut at the poste de visitage.
//
// This is the field the visiteuse uses to correct what the bonnetier keyed at
// the terminal (999 = « plus de 3 m »), and what it commits is written to
// `defaut_qualite` at validation. Two ways it can be silently wrong, both of
// which have happened or nearly did:
//
//  1. The strip regex was `[^d]` instead of `\D` — "keep everything that is
//     not the letter d" — so no digit could be typed at all and every blur
//     committed 0 (reported 2026-08-27). Nothing on screen said so: the field
//     simply showed 0 afterwards, and 0 is a plausible quantity.
//  2. An empty field used to commit 0. Clicking into a pill and out of it
//     without typing wiped the bonnetier's declaration. Empty must mean
//     "leave it alone"; zero is reachable by typing zero.
import { describe, expect, it } from 'vitest'
import { qteCommit, qteDigits } from './ProductionVisitage'

describe('qteDigits', () => {
  it('keeps the digits', () => {
    expect(qteDigits('75')).toBe('75')
    expect(qteDigits('999')).toBe('999')
  })

  it('drops everything that is not a digit', () => {
    expect(qteDigits('12a3')).toBe('123')
    expect(qteDigits('1,5')).toBe('15')
    expect(qteDigits('-4')).toBe('4')
    expect(qteDigits('abc')).toBe('')
  })

  it('honours the legacy 4-digit mask', () => {
    expect(qteDigits('12345')).toBe('1234')
  })
})

describe('qteCommit', () => {
  it('commits what was typed', () => {
    expect(qteCommit('75')).toBe(75)
    expect(qteCommit('0')).toBe(0)
    expect(qteCommit('9999')).toBe(9999)
  })

  it('returns null on an empty field — the stored value stands', () => {
    expect(qteCommit('')).toBeNull()
    expect(qteCommit('   ')).toBeNull()
    expect(qteCommit('abc')).toBeNull()
  })

  it('caps at the mask instead of overflowing', () => {
    expect(qteCommit('12345')).toBe(1234)
  })
})
