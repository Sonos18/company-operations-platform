import { describe, expect, it } from 'vitest'
import { formatDate } from '../../../app/utils/materials/date-display'

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
