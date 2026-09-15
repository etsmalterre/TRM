import { describe, expect, it } from 'vitest'
import { cheminListe, estInactif, lireVue } from './vue-metiers'

const sansOf = { actif: false, of: null }
const enReglage = { actif: true, of: {} as never }

describe('vue-metiers', () => {
  it('a bonnetier follows `actif`, a régleur follows the OF', () => {
    expect(estInactif(sansOf, false)).toBe(true)
    expect(estInactif(sansOf, true)).toBe(true)
    expect(estInactif({ actif: false, of: {} as never }, false)).toBe(true)
    expect(estInactif({ actif: false, of: {} as never }, true)).toBe(false)
    expect(estInactif(enReglage, true)).toBe(false)
  })

  it('back from an idle métier lands on Inactifs, otherwise on Actifs', () => {
    expect(cheminListe(sansOf, false)).toBe('/?vue=inactifs')
    expect(cheminListe(enReglage, false)).toBe('/')
    // Machine not resolved yet (deep link): the default tab.
    expect(cheminListe(undefined, false)).toBe('/')
  })

  it('reads the tab from the URL, Actifs by default', () => {
    expect(lireVue(new URLSearchParams('vue=inactifs'))).toBe('inactifs')
    expect(lireVue(new URLSearchParams(''))).toBe('actifs')
    expect(lireVue(new URLSearchParams('vue=nimporte'))).toBe('actifs')
  })
})
