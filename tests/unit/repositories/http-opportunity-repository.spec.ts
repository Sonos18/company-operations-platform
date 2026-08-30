import { describe, expect, it, vi } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import { createHttpOpportunityRepository } from '../../../app/repositories/http/http-opportunity-repository'

const companyId = '81000000-0000-4000-8000-000000000020'
const opportunityId = '81000000-0000-4000-8000-000000000030'
const requestId = '81000000-0000-4000-8000-000000000099'
const timestamp = '2026-08-30T00:00:00.000Z'

describe('HTTP Opportunity repository', () => {
  it('uses fixed company-scoped list/create routes and strict response schemas', async () => {
    const responses: unknown[] = [[{
      id: opportunityId, validityState: 'valid', canonicalOpportunityId: null,
      primaryCustomerName: 'VQH Lead', needDescription: null, version: 0,
      createdAt: timestamp, updatedAt: timestamp,
    }], {
      opportunityId, workflowInstanceId: '81000000-0000-4000-8000-000000000031',
      intakeNodeInstanceId: '81000000-0000-4000-8000-000000000032',
      intakeExecutionId: '81000000-0000-4000-8000-000000000033',
      evaluationNodeInstanceId: '81000000-0000-4000-8000-000000000034',
      evaluationExecutionId: '81000000-0000-4000-8000-000000000035',
      decisionCycleId: '81000000-0000-4000-8000-000000000036', opportunityVersion: 0,
      intakeExecutionVersion: 0, evaluationExecutionVersion: 0, decisionCycleVersion: 0,
    }]
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(responses.shift()))
    const repository = createHttpOpportunityRepository({ companyId, client: { request } as never })

    await expect(repository.list()).resolves.toHaveLength(1)
    await expect(repository.create({ primaryCustomerName: 'VQH Lead' })).resolves.toMatchObject({ opportunityId })
    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: `/api/companies/${companyId}/opportunities`, method: 'GET',
    }))
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: `/api/companies/${companyId}/opportunities`, method: 'POST', body: { primaryCustomerName: 'VQH Lead' },
    }))
  })

  it('maps only scoped Opportunity 404 to null', async () => {
    const notFound = new ClientError({ kind: 'api', code: 'OPPORTUNITY_NOT_FOUND', message: 'missing', requestId, retryable: false })
    const request = vi.fn().mockRejectedValue(notFound)
    const repository = createHttpOpportunityRepository({ companyId, client: { request } as never })
    await expect(repository.getById(opportunityId)).resolves.toBeNull()
  })

  it('uses explicit history-preserving command URLs and exact bodies', async () => {
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(null))
    const repository = createHttpOpportunityRepository({ companyId, client: { request } as never })
    await repository.endContactRelationship(opportunityId, '81000000-0000-4000-8000-000000000040', {
      endReason: 'Changed contact', expectedOpportunityVersion: 2,
    })
    await repository.retireScope(opportunityId, '81000000-0000-4000-8000-000000000041', {
      retireReason: 'Out of scope', expectedOpportunityVersion: 3,
    })
    await repository.resolveDuplicateConcern(opportunityId, '81000000-0000-4000-8000-000000000042', {
      resolution: 'different_need', resolutionNote: 'Separate need', expectedOpportunityVersion: 4,
    })
    expect(request.mock.calls.map(call => call[0])).toEqual([
      expect.objectContaining({ url: `/api/companies/${companyId}/opportunities/${opportunityId}/contacts/81000000-0000-4000-8000-000000000040/end`, method: 'POST' }),
      expect.objectContaining({ url: `/api/companies/${companyId}/opportunities/${opportunityId}/scopes/81000000-0000-4000-8000-000000000041/retire`, method: 'POST' }),
      expect.objectContaining({ url: `/api/companies/${companyId}/opportunities/${opportunityId}/duplicate-concerns/81000000-0000-4000-8000-000000000042/resolve`, method: 'POST' }),
    ])
  })
})
