import { describe, expect, it, vi } from 'vitest'
import { createAuthSessionService } from '../../../server/features/auth/session.service'

const vqh = {
  tenantId: '10000000-0000-4000-8000-000000000010',
  companyId: '10000000-0000-4000-8000-000000000020',
  companyCode: 'VQH',
  companyName: 'Việt Quốc Huy',
  roles: ['company_admin', 'company_admin'],
  permissions: ['employee.read_directory', 'employee.read_directory'],
}

const minh = {
  tenantId: '10000000-0000-4000-8000-000000000011',
  companyId: '10000000-0000-4000-8000-000000000021',
  companyCode: 'MINH',
  companyName: 'Minh Hoàng',
  roles: ['employee'],
  permissions: [],
}

describe('auth session service', () => {
  it('returns the authenticated actor with ordered, schema-normalized company access', async () => {
    const listCompanies = vi.fn().mockResolvedValue([vqh, minh])
    const service = createAuthSessionService({ listCompanies })

    await expect(service.getSession({ userId: 'user-vqh', email: null })).resolves.toEqual({
      user: { id: 'user-vqh', email: null },
      companies: [
        {
          ...vqh,
          roles: ['company_admin'],
          permissions: ['employee.read_directory'],
        },
        minh,
      ],
    })
    expect(listCompanies).toHaveBeenCalledWith('user-vqh')
  })

  it('fails closed when the company reader returns malformed access', async () => {
    const service = createAuthSessionService({
      listCompanies: vi.fn().mockResolvedValue([{ ...vqh, companyId: 'not-a-uuid' }]),
    })

    await expect(service.getSession({ userId: 'user-vqh', email: 'owner@vqh.local' }))
      .rejects.toThrow()
  })
})
