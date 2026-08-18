import { describe, expect, it, vi } from 'vitest'
import { createTenancyService } from '../../../server/features/tenancy/tenancy.service'

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
})
