import { describe, expect, it, vi } from 'vitest'
import { ensureRequestId } from '../../../server/utils/request-id'

describe('ensureRequestId', () => {
  it('keeps a valid UUID', () => {
    const id = '10000000-0000-4000-8000-000000000001'
    expect(ensureRequestId(id, vi.fn())).toBe(id)
  })

  it('replaces an invalid value', () => {
    const createId = vi.fn(() => '30000000-0000-4000-8000-000000000001')
    expect(ensureRequestId('invalid', createId))
      .toBe('30000000-0000-4000-8000-000000000001')
    expect(createId).toHaveBeenCalledOnce()
  })

  it('creates a UUID with the default generator', () => {
    expect(ensureRequestId(undefined))
      .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})
