import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuthenticatedRequest: vi.fn(),
  createSupabaseTenancyReader: vi.fn(),
  createSupabaseAuthorizationReader: vi.fn(),
  createTenancyService: vi.fn(),
  createAuthSessionService: vi.fn(),
}))

vi.mock('../../../server/utils/auth-context', () => ({
  requireAuthenticatedRequest: mocks.requireAuthenticatedRequest,
}))

vi.mock('../../../server/utils/api-error', () => ({
  runApiRoute: (_event: unknown, handler: () => Promise<unknown>) => handler(),
}))

vi.mock('../../../server/features/tenancy/tenancy.service', () => ({
  createSupabaseTenancyReader: mocks.createSupabaseTenancyReader,
  createTenancyService: mocks.createTenancyService,
}))

vi.mock('../../../server/features/authorization/authorization.service', () => ({
  createSupabaseAuthorizationReader: mocks.createSupabaseAuthorizationReader,
}))

vi.mock('../../../server/features/auth/session.service', () => ({
  createAuthSessionService: mocks.createAuthSessionService,
}))

describe('auth session route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubGlobal('defineEventHandler', <T>(handler: T) => handler)
  })

  it('authenticates once, assembles the RLS company reader, and delegates the actor to the session service', async () => {
    const db = { rls: 'user-scoped-client' }
    const actor = { userId: 'user-vqh', email: 'owner@vqh.local' }
    const tenancyReader = { listCompanyAccess: vi.fn(), findCompanyAccess: vi.fn() }
    const authorizationReader = { listAccess: vi.fn() }
    const companyReader = { listCompanies: vi.fn() }
    const getSession = vi.fn().mockResolvedValue({
      user: { id: actor.userId, email: actor.email },
      companies: [],
    })
    mocks.requireAuthenticatedRequest.mockResolvedValue({ actor, db })
    mocks.createSupabaseTenancyReader.mockReturnValue(tenancyReader)
    mocks.createSupabaseAuthorizationReader.mockReturnValue(authorizationReader)
    mocks.createTenancyService.mockReturnValue(companyReader)
    mocks.createAuthSessionService.mockReturnValue({ getSession })

    const handler = (await import('../../../server/api/auth/session.get')).default

    await expect(handler({} as never)).resolves.toEqual({
      user: { id: actor.userId, email: actor.email },
      companies: [],
    })
    expect(mocks.requireAuthenticatedRequest).toHaveBeenCalledTimes(1)
    expect(mocks.createSupabaseTenancyReader).toHaveBeenCalledWith(db)
    expect(mocks.createSupabaseAuthorizationReader).toHaveBeenCalledWith(db)
    expect(mocks.createTenancyService).toHaveBeenCalledWith(tenancyReader, authorizationReader)
    expect(mocks.createAuthSessionService).toHaveBeenCalledWith(companyReader)
    expect(getSession).toHaveBeenCalledWith(actor)
  })
})
