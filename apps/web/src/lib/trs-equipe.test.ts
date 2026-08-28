import { describe, it, expect } from 'vitest'
import {
  CIBLE_MIN_PX,
  echelleEquipe,
  fmtDuree,
  fmtHeuresMin,
  fmtKg,
  fmtTotalHeures,
  FORFAITS_BRUTS_MIN,
  MARQUE_MIN_PX,
  rectCible,
  rectMarque,
  REGLES,
  libelleEquipe,
} from './trs-equipe'
// The API file itself — ETM is a mandatory sibling checkout (CLAUDE.md
// § Shared screens), so this is the one place the numbers the ⓘ dialog
// prints are checked against the numbers the API deducts. From a paired
// worktree, `ETM_API_TRS_TRM` points the import at the NG worktree's copy
// until the NG branch lands (same idea as ETM_WEB_SRC for shared screens):
//   ETM_API_TRS_TRM=C:/dev/etsmalterre/ETM-trs-erp/apps/api/src/lib/trs-trm.ts pnpm test
const {
  FORFAIT_MIN: API_FORFAIT_MIN,
  INTERVENTION_MAX_S: API_INTERVENTION_MAX_S,
  SEUILS_FI_TRS: API_SEUILS,
  equipeCourante,
} = await import(/* @vite-ignore */ process.env.ETM_API_TRS_TRM ?? '../../../../../ETM/apps/api/src/lib/trs-trm')

const T0 = new Date(2026, 7, 28, 13, 0, 0, 0).getTime()
const H = 3_600_000

describe('the rules the dialog quotes are the API’s', () => {
  it('forfaits and intervention minute', () => {
    expect(REGLES.forfaitsMin).toEqual(API_FORFAIT_MIN)
    expect(REGLES.interventionMaxMin * 60).toBe(API_INTERVENTION_MAX_S)
    expect(FORFAITS_BRUTS_MIN).toEqual({ nettoyage: { sans: 4, lycra: 7 }, finPiece: { sans: 6, lycra: 9 } })
  })
  it('colour thresholds', () => {
    expect(REGLES.seuils).toEqual(API_SEUILS)
  })
  it('shift grid', () => {
    const d = (h: number) => new Date(2026, 7, 28, h).getTime()
    expect(equipeCourante(d(5)).nom).toBe('Matin')
    expect(equipeCourante(d(13)).nom).toBe('Après-Midi')
    expect(equipeCourante(d(21)).nom).toBe('Nuit')
    expect(REGLES.equipes.map((e) => e.debut)).toEqual(['5 h', '13 h', '21 h'])
  })
})

describe('echelleEquipe', () => {
  const e = echelleEquipe(T0, T0 + 8 * H, 800)
  it('maps the shift onto the width and clamps outside it', () => {
    expect(e.x(T0)).toBe(0)
    expect(e.x(T0 + 4 * H)).toBe(400)
    expect(e.x(T0 + 8 * H)).toBe(800)
    expect(e.x(T0 - H)).toBe(0)
    expect(e.x(T0 + 9 * H)).toBe(800)
  })
  it('graduates every hour, both ends included', () => {
    expect(e.ticks.map((t) => t.label)).toEqual(['13h', '14h', '15h', '16h', '17h', '18h', '19h', '20h', '21h'])
    expect(e.ticks[0].x).toBe(0)
    expect(e.ticks[8].x).toBe(800)
  })
  it('crosses midnight on the night shift', () => {
    const nuit = echelleEquipe(new Date(2026, 7, 28, 21).getTime(), new Date(2026, 7, 29, 5).getTime(), 800)
    expect(nuit.ticks.map((t) => t.label)).toEqual(['21h', '22h', '23h', '0h', '1h', '2h', '3h', '4h', '5h'])
  })
})

describe('marks and hit targets', () => {
  const e = echelleEquipe(T0, T0 + 8 * H, 800) // 100 px per hour
  it('keeps a one-minute stop visible', () => {
    const r = rectMarque(e, T0, T0 + 60_000)
    expect(r.w).toBe(MARQUE_MIN_PX)
  })
  it('never lets a mark overflow the right edge', () => {
    const r = rectMarque(e, T0 + 8 * H - 30_000, T0 + 8 * H)
    expect(r.x + r.w).toBeLessThanOrEqual(800)
  })
  it('widens a thin mark’s target to the minimum, centred and inside the scale', () => {
    expect(rectCible(e, 400, 4)).toEqual({ x: 400 + 2 - CIBLE_MIN_PX / 2, w: CIBLE_MIN_PX })
    expect(rectCible(e, 0, 4)).toEqual({ x: 0, w: CIBLE_MIN_PX })
    expect(rectCible(e, 796, 4)).toEqual({ x: 800 - CIBLE_MIN_PX, w: CIBLE_MIN_PX })
    expect(rectCible(e, 100, 60)).toEqual({ x: 100, w: 60 })
  })
})

describe('formatters', () => {
  it('durations', () => {
    expect(fmtDuree(45)).toBe('45 s')
    expect(fmtDuree(2692)).toBe('44 min 52 s')
    expect(fmtDuree(3900)).toBe('1 h 05')
    expect(fmtHeuresMin(7 * 3600 + 6 * 60)).toBe('7 h 06')
    expect(fmtTotalHeures(21 * 3600 + 12 * 60)).toBe('Total : 21 Heures 12 min')
    expect(fmtTotalHeures(0)).toBe('Total : 0 Heures 0 min')
  })
  it('kilos keep a decimal only when it carries something', () => {
    expect(fmtKg(212)).toBe('212 kg')
    expect(fmtKg(262.4)).toBe('262,4 kg')
    expect(fmtKg(20.299999237)).toBe('20,3 kg')
  })
  it('shift captions are the legacy’s', () => {
    expect(libelleEquipe('Matin')).toBe('Équipe du Matin')
    expect(libelleEquipe('Après-Midi')).toBe('Équipe de l’après-midi')
    expect(libelleEquipe('Nuit')).toBe('Équipe de nuit')
  })
})
