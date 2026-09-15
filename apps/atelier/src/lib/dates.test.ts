import { describe, expect, it } from 'vitest'
import { formatDateHfsql } from './dates'

describe('formatDateHfsql', () => {
  it('slices an HFSQL DATE without going through the timezone', () => {
    expect(formatDateHfsql('20240312')).toBe('12/03/2024')
  })
  it('takes the date part of an HFSQL DATETIME', () => {
    expect(formatDateHfsql('20240312143000000')).toBe('12/03/2024')
  })
  it('renders nothing for an empty or unparseable value', () => {
    expect(formatDateHfsql(null)).toBe('')
    expect(formatDateHfsql(' ')).toBe('')
    expect(formatDateHfsql('pas une date')).toBe('')
  })
})
