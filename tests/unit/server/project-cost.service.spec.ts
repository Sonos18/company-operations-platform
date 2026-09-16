import { describe, expect, it, vi } from 'vitest'
import { ProjectCostService } from '../../../server/features/costs/project-cost.service'

const context = (permissions: string[]) => ({ actorId: 'c1010000-0000-4000-8000-000000000902', tenantId: 'c1010000-0000-4000-8000-000000000010', companyId: 'c1010000-0000-4000-8000-000000000020', permissions, requestId: 'c1010000-0000-4000-8000-000000000999' })

describe('Project Cost service', () => {
  it('requires cost.read before summary access', async () => {
    const repository = { listSummaries: vi.fn() }
    const service = new ProjectCostService(repository as never)
    await expect(service.listSummaries(context([]))).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(repository.listSummaries).not.toHaveBeenCalled()
  })

  it('allows cost.manage create without cost.read and preserves idempotency input', async () => {
    const repository = { create: vi.fn().mockResolvedValue({ id: 'c1010000-0000-4000-8000-000000000001', version: 0, replayed: false }) }
    const service = new ProjectCostService(repository as never)
    await expect(service.create(context(['cost.manage']), { projectId: 'c1010000-0000-4000-8000-000000000101', description: 'Synthetic', amount: '9007199254740993.0000', currencyCode: 'VND', workStatus: 'unknown', nonOverlapConfirmationReference: 'confirmed' }, 'c1010000-0000-4000-8000-000000000998')).resolves.toMatchObject({ replayed: false })
    expect(repository.create).toHaveBeenCalledOnce()
  })
})
