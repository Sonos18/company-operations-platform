import { describe, expect, it, vi } from 'vitest'
import { createOpportunityService } from '../../../server/features/opportunities/opportunity.service'

const context = {
  actorId: '64000000-0000-4000-8000-000000000001',
  tenantId: '64000000-0000-4000-8000-000000000010',
  companyId: '64000000-0000-4000-8000-000000000020',
  permissions: ['opportunity.create'] as const,
  requestId: '64000000-0000-4000-8000-000000000099',
}

describe('Stage 01 Opportunity service', () => {
  it('checks permission and forwards server company/request scope', async () => {
    const create = vi.fn().mockResolvedValue({ opportunityId: 'ok' })
    const service = createOpportunityService({ create } as never)
    await service.create(context, { primaryCustomerName: 'VQH Lead' })
    expect(create).toHaveBeenCalledWith(
      context.companyId, { primaryCustomerName: 'VQH Lead' }, context.requestId,
    )
  })

  it('denies before repository access', async () => {
    const create = vi.fn()
    const service = createOpportunityService({ create } as never)
    await expect(service.create({ ...context, permissions: [] }, { primaryCustomerName: 'VQH Lead' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(create).not.toHaveBeenCalled()
  })
})
