import { describe, expect, it } from 'vitest'
import { debutStatut, dureeTexte, heure, heuresMinutes, jourCourt, jourLong, phraseStatut, soldeClasse, soldeSigne } from './heures'
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

describe('heuresMinutes', () => {
  it('writes minutes the MinToFormat way: HH:MM, negatives signed', () => {
    expect(heuresMinutes(2175)).toBe('36:15')
    expect(heuresMinutes(0)).toBe('00:00')
    expect(heuresMinutes(-150)).toBe('-02:30')
    expect(heuresMinutes(-15)).toBe('-00:15')
    expect(heuresMinutes(6030)).toBe('100:30')
  })
})

describe('soldeSigne / soldeClasse', () => {
  it('always shows the sign of the annual balance, and colours it', () => {
    expect(soldeSigne(150)).toBe('+02:30')
    expect(soldeSigne(-30)).toBe('-00:30')
    expect(soldeSigne(0)).toBe('00:00')
    expect(soldeSigne(0.4)).toBe('00:00')
    expect(soldeClasse(150)).toBe('text-success')
    expect(soldeClasse(-30)).toBe('text-amber-700')
    expect(soldeClasse(0)).toBe('text-foreground')
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

describe('dureeTexte — the pointage email duration', () => {
  it('minutes under an hour, « h » from one', () => {
    expect(dureeTexte(20)).toBe('20 min')
    expect(dureeTexte(128)).toBe('2 h 08')
  })
})
