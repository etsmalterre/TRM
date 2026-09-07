// Pins the period presets of the « Rapport de production » widget: the shift
// grid (5 h / 13 h / 21 h) and the calendar periods. A boundary that slips by
// a minute moves rolls from one shift's total to the next one's, silently.

import { describe, expect, it } from 'vitest'
import { bornesPeriode, debutEquipe, fmtBorne, toLocalInput } from './periode-production'

// Wednesday 2026-03-25, 10:08 local.
const NOW = new Date(2026, 2, 25, 10, 8)

describe('debutEquipe', () => {
  it('10:08 belongs to the 5 h shift of the same day', () => {
    expect(toLocalInput(debutEquipe(NOW))).toBe('2026-03-25T05:00')
  })
  it('13:00 exactly opens the afternoon shift', () => {
    expect(toLocalInput(debutEquipe(new Date(2026, 2, 25, 13, 0)))).toBe('2026-03-25T13:00')
  })
  it('12:59 is still the morning shift', () => {
    expect(toLocalInput(debutEquipe(new Date(2026, 2, 25, 12, 59)))).toBe('2026-03-25T05:00')
  })
  it('02:30 is yesterday’s 21 h shift', () => {
    expect(toLocalInput(debutEquipe(new Date(2026, 2, 25, 2, 30)))).toBe('2026-03-24T21:00')
  })
  it('21:00 exactly opens the night shift', () => {
    expect(toLocalInput(debutEquipe(new Date(2026, 2, 25, 21, 0)))).toBe('2026-03-25T21:00')
  })
})

describe('bornesPeriode', () => {
  it('équipe en cours = the whole shift, end inclusive to the minute', () => {
    expect(bornesPeriode('equipe', NOW)).toEqual({ du: '2026-03-25T05:00', au: '2026-03-25T12:59' })
  })
  it('équipe précédente = the night shift that ended at 5 h', () => {
    expect(bornesPeriode('equipe_prec', NOW)).toEqual({ du: '2026-03-24T21:00', au: '2026-03-25T04:59' })
  })
  it('the night shift crosses midnight', () => {
    expect(bornesPeriode('equipe', new Date(2026, 2, 25, 23, 30)))
      .toEqual({ du: '2026-03-25T21:00', au: '2026-03-26T04:59' })
  })
  it('aujourd’hui / hier are full civil days', () => {
    expect(bornesPeriode('jour', NOW)).toEqual({ du: '2026-03-25T00:00', au: '2026-03-25T23:59' })
    expect(bornesPeriode('hier', NOW)).toEqual({ du: '2026-03-24T00:00', au: '2026-03-24T23:59' })
  })
  it('cette semaine starts on Monday and ends tonight', () => {
    expect(bornesPeriode('semaine', NOW)).toEqual({ du: '2026-03-23T00:00', au: '2026-03-25T23:59' })
  })
  it('a Sunday still belongs to the week that began the previous Monday', () => {
    expect(bornesPeriode('semaine', new Date(2026, 2, 29, 9, 0)).du).toBe('2026-03-23T00:00')
  })
  it('semaine dernière is Monday to Sunday', () => {
    expect(bornesPeriode('semaine_prec', NOW)).toEqual({ du: '2026-03-16T00:00', au: '2026-03-22T23:59' })
  })
  it('ce mois / mois dernier', () => {
    expect(bornesPeriode('mois', NOW)).toEqual({ du: '2026-03-01T00:00', au: '2026-03-25T23:59' })
    expect(bornesPeriode('mois_prec', NOW)).toEqual({ du: '2026-02-01T00:00', au: '2026-02-28T23:59' })
  })
  it('mois dernier crosses the year', () => {
    expect(bornesPeriode('mois_prec', new Date(2026, 0, 10))).toEqual({ du: '2025-12-01T00:00', au: '2025-12-31T23:59' })
  })
})

describe('fmtBorne', () => {
  it('drops the year when current', () => {
    expect(fmtBorne('2026-03-25T05:00', NOW)).toBe('25/03 05:00')
  })
  it('keeps it otherwise', () => {
    expect(fmtBorne('2025-12-01T00:00', NOW)).toBe('01/12/2025 00:00')
  })
})
