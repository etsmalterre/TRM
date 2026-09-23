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
import { createLatch, entreeOuvreValidation, qteCommit, qteDigits } from './ProductionVisitage'

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

// The single-flight latch in front of POST /valider. Both triggers (click,
// Entrée) go through it because `isPending` is render-derived and lags
// `mutate()` by a macrotask — on 2026-08-28 two identical POSTs left the poste
// in the same second and piece 40751 came back as four rolls.

describe('createLatch', () => {
  it('lets the first trigger through and drops the second', () => {
    const latch = createLatch()
    expect(latch.take()).toBe(true)
    expect(latch.take()).toBe(false)
    expect(latch.take()).toBe(false)
  })

  it('opens again once released', () => {
    const latch = createLatch()
    expect(latch.take()).toBe(true)
    latch.release()
    expect(latch.take()).toBe(true)
  })

  it('releasing an open latch is harmless', () => {
    const latch = createLatch()
    latch.release()
    expect(latch.take()).toBe(true)
  })
})

// LIVA #1195 — Entrée is the Valider button: it opens the confirmation, and a
// second Entrée (on the focused « Valider ») confirms. The dangerous case is a
// HELD key: its repeats must never count as the second press.

describe('entreeOuvreValidation', () => {
  const enter = { key: 'Enter', repeat: false, isComposing: false, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }

  it('opens on a bare Entrée anywhere on the poste', () => {
    expect(entreeOuvreValidation(enter, 'poste')).toBe(true)
  })

  it('ignores a key repeat — two presses, never one held key', () => {
    expect(entreeOuvreValidation({ ...enter, repeat: true }, 'poste')).toBe(false)
  })

  it('leaves a field that already handled its Entrée alone', () => {
    // the defect quantity commits on Entrée and prevents the default
    expect(entreeOuvreValidation({ ...enter, defaultPrevented: true }, 'poste')).toBe(false)
  })

  it('never fires from a dialog or dropdown, the confirmation included', () => {
    expect(entreeOuvreValidation(enter, 'ailleurs')).toBe(false)
    expect(entreeOuvreValidation({ ...enter, ctrlKey: true }, 'ailleurs')).toBe(false)
  })

  it('keeps Entrée as a new line in the observations, Ctrl+Entrée still validates', () => {
    expect(entreeOuvreValidation(enter, 'texte')).toBe(false)
    expect(entreeOuvreValidation({ ...enter, ctrlKey: true }, 'texte')).toBe(true)
    expect(entreeOuvreValidation({ ...enter, metaKey: true }, 'texte')).toBe(true)
  })

  it('ignores other keys, modified Entrée and IME composition', () => {
    expect(entreeOuvreValidation({ ...enter, key: 'a' }, 'poste')).toBe(false)
    expect(entreeOuvreValidation({ ...enter, shiftKey: true }, 'poste')).toBe(false)
    expect(entreeOuvreValidation({ ...enter, altKey: true }, 'poste')).toBe(false)
    expect(entreeOuvreValidation({ ...enter, isComposing: true }, 'poste')).toBe(false)
  })
})
