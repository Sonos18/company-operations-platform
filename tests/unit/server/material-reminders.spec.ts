import { describe, expect, it, vi } from 'vitest'
import { handleMaterialReminders } from '../../../server/features/costs/material-finance/reminders'

describe('material reminders endpoint', () => {
  const emit = vi.fn(async () => ({ dueSoon: 2, overdue: 1 }))
  it('rejects a missing or wrong secret without calling the database', async () => {
    await expect(handleMaterialReminders({ secret: 's3cret', header: undefined, emit, now: () => new Date() })).rejects.toMatchObject({ statusCode: 401 })
    await expect(handleMaterialReminders({ secret: 's3cret', header: 'Bearer nope', emit, now: () => new Date() })).rejects.toMatchObject({ statusCode: 401 })
    await expect(handleMaterialReminders({ secret: '', header: 'Bearer ', emit, now: () => new Date() })).rejects.toMatchObject({ statusCode: 401 })
    expect(emit).not.toHaveBeenCalled()
  })
  it('emits with Vietnam today', async () => {
    await expect(handleMaterialReminders({ secret: 's3cret', header: 'Bearer s3cret', emit, now: () => new Date('2026-10-15T18:30:00Z') }))
      .resolves.toEqual({ dueSoon: 2, overdue: 1 })
    expect(emit).toHaveBeenCalledWith('2026-10-16')
  })
})
