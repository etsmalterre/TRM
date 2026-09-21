import { describe, expect, it } from 'vitest'
import { bornesPeriode, dureeHM, heure, heureSaisie, inputVersJour, jourCourt, jourDe, jourLong, jourVersInput } from './pointage-heures'

describe('period presets (Monday-first weeks, calendar months)', () => {
  it('this week and last week from a Monday, a Wednesday and a Sunday', () => {
    expect(bornesPeriode('semaine', '20260921')).toEqual({ du: '20260921', au: '20260927' }) // Monday
    expect(bornesPeriode('semaine', '20260923')).toEqual({ du: '20260921', au: '20260927' }) // Wednesday
    expect(bornesPeriode('semaine', '20260927')).toEqual({ du: '20260921', au: '20260927' }) // Sunday stays in its week
    expect(bornesPeriode('semaine_prec', '20260921')).toEqual({ du: '20260914', au: '20260920' })
  })

  it('months, across a year boundary and a leap February', () => {
    expect(bornesPeriode('mois', '20260921')).toEqual({ du: '20260901', au: '20260930' })
    expect(bornesPeriode('mois_prec', '20260115')).toEqual({ du: '20251201', au: '20251231' })
    expect(bornesPeriode('mois', '20280210')).toEqual({ du: '20280201', au: '20280229' })
  })

  it('the last thirty days include today', () => {
    expect(bornesPeriode('trente_jours', '20260921')).toEqual({ du: '20260823', au: '20260921' })
  })
})

describe('formatting', () => {
  const t = Date.UTC(2026, 8, 21, 6, 2) // 08:02 Paris (CEST)
  it('hours in Paris', () => {
    expect(heure(t)).toBe('08:02')
    expect(heure(null)).toBe('—')
    expect(heureSaisie(t)).toBe('08:02')
    expect(heureSaisie(null)).toBe('')
    expect(jourDe(t)).toBe('20260921')
  })
  it('days', () => {
    expect(jourLong('20260921')).toBe('lundi 21 septembre 2026')
    expect(jourCourt('20260921')).toBe('lun. 21/09')
    expect(jourVersInput('20260921')).toBe('2026-09-21')
    expect(inputVersJour('2026-09-21')).toBe('20260921')
  })
  it('durations as the legacy grid (hours not padded)', () => {
    expect(dureeHM(525)).toBe('8:45')
    expect(dureeHM(5)).toBe('0:05')
    expect(dureeHM(null)).toBe('—')
  })
})
