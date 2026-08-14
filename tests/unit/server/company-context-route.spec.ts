import { describe, expect, it, vi } from 'vitest'

const getRouterParam = vi.fn()
const requireAuthenticatedRequest = vi.fn()

vi.mock('h3', async (importOriginal) => ({
  ...await importOriginal<typeof import('h3')>(),
  getRouterParam,
}))

vi.mock('../../../server/utils/auth-context', () => ({
  requireAuthenticatedRequest,
}))

vi.mock('../../../server/utils/api-error', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/utils/api-error')>()
  return {
    ...actual,
    runApiRoute: (_event: unknown, handler: () => Promise<unknown>) => handler(),
  }
})

describe('company context route', () => {
  it('rejects a malformed company ID before authenticating or querying membership', async () => {
    getRouterParam.mockReturnValue('not-a-uuid')
    vi.stubGlobal('defineEventHandler', <T>(handler: T) => handler)

    const handler = (await import('../../../server/api/companies/[companyId]/context.get')).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      code: 'COMPANY_CONTEXT_REQUIRED',
    })
    expect(requireAuthenticatedRequest).not.toHaveBeenCalled()
  })
})
