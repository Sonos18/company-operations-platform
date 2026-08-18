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

  it('returns normalized access rather than the legacy membership role array', async () => {
    const companyId = '10000000-0000-4000-8000-000000000020'
    const membershipQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      then: (resolve: (value: unknown) => unknown) => resolve({
        data: [{
          tenant_id: '10000000-0000-4000-8000-000000000010',
          company_id: companyId,
          companies: { code: 'VQH', name: 'Việt Quốc Huy' },
        }],
        error: null,
      }),
    }
    membershipQuery.select.mockReturnValue(membershipQuery)
    membershipQuery.eq.mockReturnValue(membershipQuery)
    membershipQuery.order.mockReturnValue(membershipQuery)
    getRouterParam.mockReturnValue(companyId)
    requireAuthenticatedRequest.mockResolvedValue({
      actor: { userId: 'user-vqh', email: 'owner@vqh.local' },
      db: {
        from: vi.fn().mockReturnValue(membershipQuery),
        rpc: vi.fn().mockResolvedValue({
          data: [{
            roles: ['employee'],
            permissions: ['employee.read_directory'],
          }],
          error: null,
        }),
      },
    })
    vi.stubGlobal('defineEventHandler', <T>(handler: T) => handler)

    const handler = (await import('../../../server/api/companies/[companyId]/context.get')).default

    await expect(handler({} as never)).resolves.toEqual({
      tenantId: '10000000-0000-4000-8000-000000000010',
      companyId,
      roles: ['employee'],
      permissions: ['employee.read_directory'],
    })
  })
})
