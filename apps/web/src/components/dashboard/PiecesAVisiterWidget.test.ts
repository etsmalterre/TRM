// Pins the recovered legacy rules of the « Pièces à visiter » widget.
//
// The colour ladder is a business rule read out of WLanguage that no longer
// runs anywhere we can diff against (FI_PiecesAVisiter.wdw is PCS-compressed;
// the loop below was supplied from the source, 2026-08-27):
//
//   dhDateRouge  = DateHeureSys() ; dhDateRouge.Heure  -= 3
//   dhDateOrange = DateHeureSys() ; dhDateOrange.Heure -= 2
//   si date_fin < dhDateRouge     → RougePastel
//   sinon si date_fin < dhDateOrange → OrangePastel
//   sinon → VertPastel
//
// Both boundaries are pinned to the minute, in both directions: an off-by-one
// on `<` vs `<=` is invisible on screen and would quietly move every row's
// colour by an hour.
import { describe, expect, it } from 'vitest'
import { attenteTone, fmtAttente, fmtFinTricotage } from './PiecesAVisiterWidget'

const MIN = 60_000
const H = 3_600_000

describe('attenteTone', () => {
  it('is vert below two hours', () => {
    expect(attenteTone(0)).toBe('vert')
    expect(attenteTone(59 * MIN)).toBe('vert')
    expect(attenteTone(2 * H - MIN)).toBe('vert')
  })

  it('turns orange at exactly two hours', () => {
    expect(attenteTone(2 * H)).toBe('orange')
    expect(attenteTone(2 * H + MIN)).toBe('orange')
    expect(attenteTone(3 * H - MIN)).toBe('orange')
  })

  it('turns rouge at exactly three hours', () => {
    expect(attenteTone(3 * H)).toBe('rouge')
    expect(attenteTone(3 * H + MIN)).toBe('rouge')
    // The endpoint's window is 24 h, so this is the oldest row possible.
    expect(attenteTone(24 * H)).toBe('rouge')
  })

  it('never goes negative-tone on a clock skew', () => {
    expect(attenteTone(-5 * MIN)).toBe('vert')
  })
})

describe('fmtAttente', () => {
  it('reads as a clock, never as a decimal of hours', () => {
    expect(fmtAttente(0)).toBe('0 min')
    expect(fmtAttente(47 * MIN)).toBe('47 min')
    expect(fmtAttente(H)).toBe('1 h')
    // The screenshot's red row: 06:16:27 seen at 09:35 → 3 h 19.
    expect(fmtAttente(3 * H + 19 * MIN)).toBe('3 h 19')
    // Minutes are zero-padded so the column stays aligned.
    expect(fmtAttente(2 * H + 5 * MIN)).toBe('2 h 05')
  })

  it('truncates rather than rounds — 1 h 59 is not 2 h', () => {
    expect(fmtAttente(2 * H - 30_000)).toBe('1 h 59')
  })
})

describe('fmtFinTricotage', () => {
  it('prints the legacy column without its seconds', () => {
    // 2026-08-27 06:16:27 local — the widget drops the seconds the legacy
    // printed: nothing here is decided to the second.
    const ms = new Date(2026, 7, 27, 6, 16, 27).getTime()
    expect(fmtFinTricotage(ms)).toBe('27/08/2026 06:16')
  })
})
