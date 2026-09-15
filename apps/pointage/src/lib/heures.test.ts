import { describe, expect, it } from 'vitest'
import { debutStatut, duree, heure, jourCourt, jourLong, phraseStatut } from './heures'
import type { Ligne } from './pointage-api'

const at = (h: number, m: number) => Date.UTC(2026, 8, 15, h - 2, m) // Paris = UTC+2 in September
const ligne = (over: Partial<Ligne> = {}): Ligne => ({
  id: 1, jour: '20260915',
  debutMs: at(8, 2), debutPause1Ms: null, finPause1Ms: null, debutPause2Ms: null, finPause2Ms: null, finMs: null,
  ...over,
})

describe('heure', () => {
  it('shows Paris wall time, and a dash for a time not stamped', () => {
    expect(heure(at(8, 2))).toBe('08:02')
    expect(heure(null)).toBe('—')
  })
})

describe('jourLong / jourCourt', () => {
  it('names the day', () => {
    expect(jourLong('20260914')).toBe('lundi 14 septembre')
    expect(jourCourt('20260914')).toBe('lun. 14/09')
  })
})

describe('duree', () => {
  it('reads hours the office way', () => {
    expect(duree(0)).toBe('0')
    expect(duree(0.5)).toBe('30 min')
    expect(duree(1)).toBe('1 h')
    expect(duree(1.5)).toBe('1 h 30')
    expect(duree(0.75)).toBe('45 min')
  })
})

describe('phraseStatut', () => {
  it('dates the status from the latest return to work', () => {
    expect(phraseStatut('au_travail', ligne())).toBe('Au travail depuis 08:02')
    expect(phraseStatut('au_travail', ligne({ debutPause1Ms: at(10, 0), finPause1Ms: at(10, 15) }))).toBe('Au travail depuis 10:15')
  })

  it('dates a pause from its start — the second one when it runs', () => {
    expect(phraseStatut('en_pause', ligne({ debutPause1Ms: at(10, 0) }))).toBe('En pause depuis 10:00')
    expect(debutStatut('en_pause', ligne({ debutPause1Ms: at(10, 0), finPause1Ms: at(10, 15), debutPause2Ms: at(12, 30) }))).toBe(at(12, 30))
  })

  it('says nothing about a time when out of work', () => {
    expect(phraseStatut('hors_poste', null)).toBe('Pas au travail')
  })
})
