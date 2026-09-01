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
  it('requires both opportunity permissions before loading create options', async () => {
    const getCreateOptions = vi.fn().mockResolvedValue({ workflowKey: 'vqh.stage01' })
    const service = createOpportunityService({ getCreateOptions } as never)
    const authorized = { ...context, permissions: ['opportunity.read', 'opportunity.create'] as const }

    await expect(service.getCreateOptions(authorized)).resolves.toEqual({ workflowKey: 'vqh.stage01' })
    expect(getCreateOptions).toHaveBeenCalledWith(context.companyId)

    await expect(service.getCreateOptions({ ...context, permissions: ['opportunity.read'] as const }))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    await expect(service.getCreateOptions({ ...context, permissions: ['opportunity.create'] as const }))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
  })

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
