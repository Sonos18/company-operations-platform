import { describe, expect, it } from 'vitest'
import { ProjectFinanceService } from '../../../server/features/costs/finance/project-finance.service'

describe('C1 finance service', () => {
  it('requires cost.read before calling the finance repository', async () => {
    const repository = { overview: async () => ({ ok: true }) }
    const service = new ProjectFinanceService(repository as never)
    await expect(service.overview({ tenantId: '00000000-0000-4000-8000-000000000010', companyId: '00000000-0000-4000-8000-000000000020', permissions: [] }, '00000000-0000-4000-8000-000000000030')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  it('returns a valid empty-project model from the repository', async () => {
    const repository = { overview: async () => ({ schemaVersion: 1 }) }
    const service = new ProjectFinanceService(repository as never)
    await expect(service.overview({ tenantId: '00000000-0000-4000-8000-000000000010', companyId: '00000000-0000-4000-8000-000000000020', permissions: ['cost.read'] }, '00000000-0000-4000-8000-000000000030')).resolves.toEqual({ schemaVersion: 1 })
  })
})
