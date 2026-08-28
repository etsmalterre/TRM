// Drift guard: the dialog's numbers against the calculation's numbers.
//
// The API file is imported straight from the sibling ETM checkout — it has
// no imports of its own, and ETM being a sibling is already a build
// requirement of this repo (CLAUDE.md § Shared screens). If the API changes
// a forfait, this test fails until `regles.ts` follows.
import { describe, it, expect } from 'vitest'
import {
  FORFAIT_MIN as API_FORFAIT_MIN,
  INTERVENTION_MAX_S as API_INTERVENTION_MAX_S,
  equipeCourante,
} from '../../../../../ETM/apps/api/src/lib/trs-trm'
import { FORFAIT_MIN, FORFAIT_TOTAL_MIN, INTERVENTION_MAX_MIN, SEUILS, EQUIPES } from './regles'
import { teinteArrets, teinteDepuis, teinteTrs, teinteVitesse } from './affichage'

describe('regles — the words on the wall match the calculation', () => {
  it('mirrors the API forfaits and intervention cap', () => {
    expect(FORFAIT_MIN).toEqual(API_FORFAIT_MIN)
    expect(INTERVENTION_MAX_MIN * 60).toBe(API_INTERVENTION_MAX_S)
  })

  it('shows the operator the gross allowance — the legacy comment’s 4/7 and 6/9', () => {
    expect(FORFAIT_TOTAL_MIN.nettoyage).toEqual({ sans: 4, lycra: 7 })
    expect(FORFAIT_TOTAL_MIN.finPiece).toEqual({ sans: 6, lycra: 9 })
  })

  it('names the shifts with the API’s boundaries', () => {
    const at = (h: number) => new Date(2026, 7, 28, h, 30).getTime()
    expect(equipeCourante(at(6)).nom).toBe('Matin')
    expect(equipeCourante(at(14)).nom).toBe('Après-Midi')
    expect(equipeCourante(at(22)).nom).toBe('Nuit')
    expect(new Date(equipeCourante(at(6)).debutMs).getHours()).toBe(5)
    expect(new Date(equipeCourante(at(6)).finMs).getHours()).toBe(13)
    expect(new Date(equipeCourante(at(14)).finMs).getHours()).toBe(21)
    expect(new Date(equipeCourante(at(22)).finMs).getHours()).toBe(5)
    expect(EQUIPES.map((e) => e.nom)).toEqual(['Matin', 'Après-midi', 'Nuit'])
  })

  it('pins the colour ladders to affichage.ts', () => {
    const e = 1e-6
    expect(teinteTrs(SEUILS.trs.rouge)).toBe('rouge')
    expect(teinteTrs(SEUILS.trs.rouge + e)).toBe('ambre')
    expect(teinteTrs(SEUILS.trs.ambre)).toBe('ambre')
    expect(teinteTrs(SEUILS.trs.ambre + e)).toBe('vert')

    expect(teinteArrets(SEUILS.arrets.vert)).toBe('vert')
    expect(teinteArrets(SEUILS.arrets.vert + 1)).toBe('ambre')
    expect(teinteArrets(SEUILS.arrets.ambre)).toBe('ambre')
    expect(teinteArrets(SEUILS.arrets.ambre + 1)).toBe('rouge')

    expect(teinteVitesse(SEUILS.vitesse.vert * 100, 100)).toBe('vert')
    expect(teinteVitesse(SEUILS.vitesse.vert * 100 - e, 100)).toBe('ambre')
    expect(teinteVitesse(SEUILS.vitesse.ambre * 100, 100)).toBe('ambre')
    expect(teinteVitesse(SEUILS.vitesse.ambre * 100 - e, 100)).toBe('rouge')

    expect(teinteDepuis(SEUILS.depuisRougeMin * 60_000 - 1)).toBe('ambre')
    expect(teinteDepuis(SEUILS.depuisRougeMin * 60_000)).toBe('rouge')
  })
})
