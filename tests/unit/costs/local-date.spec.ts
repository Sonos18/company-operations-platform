import { describe, expect, it } from 'vitest'
import { localDateInputValue } from '../../../app/utils/costs/local-date'

describe('localDateInputValue utility', () => {
  it('formats single-digit months and days with leading zeros', () => {
    // 2026-05-04
    const d = new Date(2026, 4, 4, 10, 30, 0)
    expect(localDateInputValue(d)).toBe('2026-05-04')
  })

  it('formats two-digit months and days correctly', () => {
    // 2026-11-25
    const d = new Date(2026, 10, 25, 23, 45, 0)
    expect(localDateInputValue(d)).toBe('2026-11-25')
  })

  it('preserves local date near midnight without shifting to UTC', () => {
    // 2026-09-24 at 00:05 local time
    const d = new Date(2026, 8, 24, 0, 5, 0)
    expect(localDateInputValue(d)).toBe('2026-09-24')
    // 2026-09-24 at 23:55 local time
    const d2 = new Date(2026, 8, 24, 23, 55, 0)
    expect(localDateInputValue(d2)).toBe('2026-09-24')
  })

  it('defaults to current local date when called with no arguments', () => {
    const result = localDateInputValue()
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(result).toBe(expected)
  })
})
