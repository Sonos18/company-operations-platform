import { describe, expect, it, vi } from 'vitest'
import { createHttpStage01Repository } from '../../../app/repositories/http/http-stage01-repository'

const companyId = '83000000-0000-4000-8000-000000000020'
const opportunityId = '83000000-0000-4000-8000-000000000030'

describe('HTTP Stage 01 repository', () => {
  it('uses a fixed encoded criterion revision route and exact body', async () => {
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(null))
    const repository = createHttpStage01Repository({ companyId, client: { request } as never })
    const input = { expectedCycleVersion: 0, applicability: 'applicable' as const, result: 'fit' as const, rationale: 'Fits', evidence: [] }
    await repository.evaluateCriterion(opportunityId, 'customer need/fit', input)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: `/api/companies/${companyId}/opportunities/${opportunityId}/stage-01/evaluations/customer%20need%2Ffit/revisions`,
      method: 'POST', body: input,
    }))
  })

  it('uses explicit Final Decision and Reactivation endpoints without authority fields', async () => {
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(null))
    const repository = createHttpStage01Repository({ companyId, client: { request } as never })
    await repository.recordFinalDecision(opportunityId, { expectedCycleVersion: 2, outcome: 'proceed', rationale: 'Approved' })
    await repository.reactivate(opportunityId, { expectedOpportunityVersion: 3, expectedExecutionVersion: 4, expectedCycleVersion: 5, reason: 'New facts' })
    expect(request.mock.calls.map(call => call[0].url)).toEqual([
      `/api/companies/${companyId}/opportunities/${opportunityId}/stage-01/final-decision`,
      `/api/companies/${companyId}/opportunities/${opportunityId}/stage-01/reactivate`,
    ])
    expect(request.mock.calls[0]![0].body).not.toHaveProperty('decisionAuthorityUserId')
  })
})
