import { describe, it, expect } from 'vitest'
import { actionsDisponibles, type EtatOf } from './actions'

// Mirror of the API's `actionsFor()` (ETM/apps/api/src/routes/atelier.ts) —
// the server is authoritative, this copy only decides what to render, and the
// two change together.

const base: EtatOf = {
  demarre: true,
  interrompu: false,
  finir_fil: false,
  produites: 2,
  nb_pieces: 10,
  nb_nettoyages_faits: 0,
  nb_nettoyages_requis: 2,
}

describe('actionsDisponibles — an OF not yet launched', () => {
  it('offers « Lancement OF » to the régleur alone (2026-09-22)', () => {
    expect(actionsDisponibles({ ...base, demarre: false }, true)).toEqual(['Lancement OF'])
    expect(actionsDisponibles({ ...base, demarre: false }, false)).toEqual([])
  })
})

describe('actionsDisponibles — a running OF', () => {
  it('routine, quality, and the régleur pause / play pair', () => {
    expect(actionsDisponibles(base, false)).toEqual(['Nettoyage', 'Fin de pièce', 'Défaut'])
    expect(actionsDisponibles(base, true)).toEqual(['Nettoyage', 'Fin de pièce', 'Défaut', 'Interrompre OF'])
    expect(actionsDisponibles({ ...base, interrompu: true }, true)).toEqual([
      'Nettoyage',
      'Fin de pièce',
      'Défaut',
      'Relancer OF',
    ])
  })
  it('drops Nettoyage once the piece has had its cleanings', () => {
    expect(actionsDisponibles({ ...base, nb_nettoyages_faits: 2 }, false)).toEqual(['Fin de pièce', 'Défaut'])
  })
  it('swaps Fin de pièce for Terminer OF on the last piece, unless the OF runs the yarn out', () => {
    expect(actionsDisponibles({ ...base, produites: 9, nb_nettoyages_faits: 2 }, false)).toEqual(['Terminer OF', 'Défaut'])
    expect(actionsDisponibles({ ...base, produites: 9, nb_nettoyages_faits: 2, finir_fil: true }, false)).toEqual([
      'Fin de pièce',
      'Dernière pièce',
      'Défaut',
    ])
  })
})
