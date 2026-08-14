import { describe, expect, it, vi } from 'vitest'
import { createTenancyService } from '../../../server/features/tenancy/tenancy.service'

const vqh = {
  tenantId: '10000000-0000-4000-8000-000000000010',
  companyId: '10000000-0000-4000-8000-000000000020',
  companyCode: 'VQH',
  companyName: 'Việt Quốc Huy',
  roles: ['director'],
}

describe('tenancy service', () => {
  it('lists access for the authenticated user', async () => {
    const reader = {
      listCompanyAccess: vi.fn().mockResolvedValue([vqh]),
      findCompanyAccess: vi.fn(),
    }
    await expect(createTenancyService(reader).listCompanies('user-vqh'))
      .resolves.toEqual([vqh])
    expect(reader.listCompanyAccess).toHaveBeenCalledWith('user-vqh')
  })

  it('derives tenant context from company membership', async () => {
    const reader = {
      listCompanyAccess: vi.fn(),
      findCompanyAccess: vi.fn().mockResolvedValue(vqh),
    }
    await expect(createTenancyService(reader).resolveCompanyContext(
      'user-vqh',
      vqh.companyId,
    )).resolves.toEqual({
      tenantId: vqh.tenantId,
      companyId: vqh.companyId,
      roles: ['director'],
    })
  })

  it('uses the same forbidden result for absent and cross-tenant companies', async () => {
    const reader = {
      listCompanyAccess: vi.fn(),
      findCompanyAccess: vi.fn().mockResolvedValue(null),
    }
    await expect(createTenancyService(reader).resolveCompanyContext('user-vqh', 'other'))
      .rejects.toMatchObject({ statusCode: 403, code: 'COMPANY_FORBIDDEN' })
  })
})
