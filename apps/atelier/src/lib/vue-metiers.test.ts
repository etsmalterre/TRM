import { describe, expect, it } from 'vitest'
import { cheminListe, estInactif, lireVue } from './vue-metiers'

const sansOf = { actif: false, of: null }
const enMarche = { actif: true, of: { demarre: true } as never }
const enReglage = { actif: true, of: { demarre: false } as never }

describe('vue-metiers', () => {
  it('a bonnetier follows `actif`, a régleur follows the OF', () => {
    expect(estInactif(sansOf, false)).toBe(true)
    expect(estInactif(sansOf, true)).toBe(true)
    expect(estInactif({ actif: false, of: { demarre: true } as never }, false)).toBe(true)
    expect(estInactif({ actif: false, of: { demarre: true } as never }, true)).toBe(false)
    expect(estInactif(enMarche, false)).toBe(false)
    expect(estInactif(enMarche, true)).toBe(false)
  })

  it('an OF not yet launched is inactive for a bonnetier, the régleur’s work for a régleur (2026-09-22)', () => {
    expect(estInactif(enReglage, false)).toBe(true)
    expect(estInactif(enReglage, true)).toBe(false)
  })

  it('back from an idle métier lands on Inactifs, otherwise on Actifs', () => {
    expect(cheminListe(sansOf, false)).toBe('/?vue=inactifs')
    expect(cheminListe(enReglage, false)).toBe('/?vue=inactifs')
    expect(cheminListe(enReglage, true)).toBe('/')
    expect(cheminListe(enMarche, false)).toBe('/')
    // Machine not resolved yet (deep link): the default tab.
    expect(cheminListe(undefined, false)).toBe('/')
  })

  it('reads the tab from the URL, Actifs by default', () => {
    expect(lireVue(new URLSearchParams('vue=inactifs'))).toBe('inactifs')
    expect(lireVue(new URLSearchParams(''))).toBe('actifs')
    expect(lireVue(new URLSearchParams('vue=nimporte'))).toBe('actifs')
  })
})
