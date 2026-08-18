import { describe, expect, it, vi } from 'vitest'
import { createSupabaseTenancyReader, createTenancyService } from '../../../server/features/tenancy/tenancy.service'

const vqh = {
  tenantId: '10000000-0000-4000-8000-000000000010',
  companyId: '10000000-0000-4000-8000-000000000020',
  companyCode: 'VQH',
  companyName: 'Việt Quốc Huy',
}

const normalizedAccess = {
  roles: ['employee'],
  permissions: ['employee.read_directory'] as const,
}

function membershipDb(active: boolean) {
  const membershipQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => resolve({
      data: [{
        tenant_id: vqh.tenantId,
        company_id: vqh.companyId,
        companies: { code: vqh.companyCode, name: vqh.companyName },
      }],
      error: null,
    }),
  }
  membershipQuery.select.mockReturnValue(membershipQuery)
  membershipQuery.eq.mockReturnValue(membershipQuery)
  membershipQuery.order.mockReturnValue(membershipQuery)

  return {
    from: vi.fn().mockReturnValue(membershipQuery),
    rpc: vi.fn().mockResolvedValue({ data: active, error: null }),
  }
}

describe('tenancy service', () => {
  it('lists access for the authenticated user', async () => {
    const reader = {
      listCompanyAccess: vi.fn().mockResolvedValue([vqh]),
      findCompanyAccess: vi.fn(),
    }
    const authorization = { listAccess: vi.fn().mockResolvedValue(normalizedAccess) }
    await expect(createTenancyService(reader, authorization).listCompanies('user-vqh'))
      .resolves.toEqual([{ ...vqh, ...normalizedAccess }])
    expect(reader.listCompanyAccess).toHaveBeenCalledWith('user-vqh')
  })

  it('ignores legacy membership roles when resolving normalized company access', async () => {
    const reader = {
      listCompanyAccess: vi.fn(),
      findCompanyAccess: vi.fn().mockResolvedValue({ ...vqh, roles: ['company_admin'] }),
    }
    const authorization = { listAccess: vi.fn().mockResolvedValue(normalizedAccess) }
    await expect(createTenancyService(reader, authorization).resolveCompanyContext(
      'user-vqh',
      vqh.companyId,
    )).resolves.toEqual({
      tenantId: vqh.tenantId,
      companyId: vqh.companyId,
      ...normalizedAccess,
    })
  })

  it('uses the same forbidden result for absent and cross-tenant companies', async () => {
    const reader = {
      listCompanyAccess: vi.fn(),
      findCompanyAccess: vi.fn().mockResolvedValue(null),
    }
    const authorization = { listAccess: vi.fn() }
    await expect(createTenancyService(reader, authorization).resolveCompanyContext('user-vqh', '10000000-0000-4000-8000-000000000099'))
      .rejects.toMatchObject({ statusCode: 403, code: 'COMPANY_FORBIDDEN' })
    expect(authorization.listAccess).not.toHaveBeenCalled()
  })

  it('denies company context when the active-membership RPC returns false', async () => {
    const db = membershipDb(false)
    const authorization = { listAccess: vi.fn() }
    const service = createTenancyService(
      createSupabaseTenancyReader(db as never),
      authorization,
    )

    await expect(service.resolveCompanyContext('user-vqh', vqh.companyId))
      .rejects.toMatchObject({ statusCode: 403, code: 'COMPANY_FORBIDDEN' })
    expect(authorization.listAccess).not.toHaveBeenCalled()
  })

  it('resolves company context when the active-membership RPC returns true', async () => {
    const db = membershipDb(true)
    const authorization = { listAccess: vi.fn().mockResolvedValue(normalizedAccess) }
    const service = createTenancyService(
      createSupabaseTenancyReader(db as never),
      authorization,
    )

    await expect(service.resolveCompanyContext('user-vqh', vqh.companyId)).resolves.toEqual({
      tenantId: vqh.tenantId,
      companyId: vqh.companyId,
      ...normalizedAccess,
    })
  })
})
