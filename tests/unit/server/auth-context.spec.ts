import { describe, expect, it, vi } from 'vitest'
import { authenticateBearer } from '../../../server/utils/auth-context'

describe('authenticateBearer', () => {
  it('rejects a missing token', async () => {
    await expect(authenticateBearer(undefined, { getUser: vi.fn() }))
      .rejects.toMatchObject({ statusCode: 401, code: 'AUTH_REQUIRED' })
  })

  it('rejects a malformed authorization value', async () => {
    await expect(authenticateBearer('Bearer signed-token extra', { getUser: vi.fn() }))
      .rejects.toMatchObject({ statusCode: 401, code: 'AUTH_REQUIRED' })
  })

  it('rejects an invalid token', async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new Error('invalid'),
    })
    await expect(authenticateBearer('Bearer invalid', { getUser }))
      .rejects.toMatchObject({ statusCode: 401, code: 'AUTH_INVALID' })
  })

  it('returns the verified actor and token', async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1', email: 'owner@vqh.local' } },
      error: null,
    })
    await expect(authenticateBearer('Bearer signed-token', { getUser }))
      .resolves.toEqual({
        userId: 'user-1',
        email: 'owner@vqh.local',
        accessToken: 'signed-token',
      })
  })
})
