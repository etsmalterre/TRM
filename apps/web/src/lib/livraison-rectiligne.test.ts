import { describe, expect, it } from 'vitest'
import { lireQuantite, resumerLivraison, saisiesDuReste, type LigneALivrer } from './livraison-rectiligne'

// Commande TRM 2925 (LIVA #1381).
const LIGNES: LigneALivrer[] = [
  { IDligne_commande_client: 1, quantite: 26, expedie: 0, reste_a_livrer: 26 },
  { IDligne_commande_client: 2, quantite: 149, expedie: 49, reste_a_livrer: 100 },
  { IDligne_commande_client: 3, quantite: 57, expedie: 57, reste_a_livrer: 0 },
]

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

describe('resumerLivraison', () => {
  it('keeps only the lines with a quantity, in order, and adds them up', () => {
    const r = resumerLivraison(LIGNES, { 2: '40', 1: '26' })
    expect(r.lignes).toEqual([
      { IDligne_commande_client: 1, quantite: 26 },
      { IDligne_commande_client: 2, quantite: 40 },
    ])
    expect(r.total).toBe(66)
    expect(r.depassements.size).toBe(0)
  })
  it('nothing typed: nothing to post', () => {
    expect(resumerLivraison(LIGNES, {}).lignes).toEqual([])
  })
  it('says by how much a line goes beyond what remained, without refusing it', () => {
    const r = resumerLivraison(LIGNES, { 2: '104', 3: '2' })
    expect(r.lignes).toHaveLength(2)
    expect(r.depassements.get(2)).toBe(4)
    expect(r.depassements.get(3)).toBe(2)
  })
})

describe('saisiesDuReste', () => {
  it('fills every line still owed, and leaves a delivered line empty', () => {
    expect(saisiesDuReste(LIGNES)).toEqual({ 1: '26', 2: '100' })
  })
})
