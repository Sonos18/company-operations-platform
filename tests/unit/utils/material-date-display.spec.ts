import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from '../../../app/utils/materials/date-display'

describe('formatDate', () => {
  it('turns YYYY-MM-DD into dd/MM/yyyy by splitting the string', () => {
    expect(formatDate('2026-10-10')).toBe('10/10/2026')
    expect(formatDate('2026-01-05')).toBe('05/01/2026')
  })

  it('returns anything that is not a plain date unchanged', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate('2026-10-10T00:00:00Z')).toBe('2026-10-10T00:00:00Z')
  })
})

describe('formatDateTime', () => {
  it('formats in Vietnam time whatever the browser timezone is', () => {
    // 17:30 UTC is 00:30 the next day in Asia/Ho_Chi_Minh (UTC+7).
    expect(formatDateTime('2026-10-14T17:30:00.000Z')).toContain('15/10/26')
    expect(formatDateTime('2026-10-14T17:30:00.000Z')).toMatch(/00:30|0:30/)
  })

  it('returns an unreadable value unchanged', () => {
    expect(formatDateTime('not a date')).toBe('not a date')
  })
})
