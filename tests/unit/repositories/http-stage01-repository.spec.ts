import { describe, expect, it, vi } from 'vitest'
import { createHttpStage01Repository } from '../../../app/repositories/http/http-stage01-repository'
import { stage01DetailSchema } from '../../../shared/schemas/stage01'

const companyId = '83000000-0000-4000-8000-000000000020'
const opportunityId = '83000000-0000-4000-8000-000000000030'
const timestamp = '2026-08-31T00:00:00.000Z'
const legacyDetail = stage01DetailSchema.parse({
  opportunity: {
    id: opportunityId, validityState: 'valid', canonicalOpportunityId: null,
    primaryCustomerName: 'Customer', customerTypeCode: 'customer', needDescription: 'Need',
    locationStatus: 'area_known', locationText: 'District 1', primaryLeadSourceCode: 'referral',
    engagementStatusCode: 'active', budgetStatusCode: 'known', budgetMin: 1, budgetMax: 2,
    currencyCode: 'VND', budgetNote: null, timelineStatusCode: 'known', timelineStartDate: null,
    timelineEndDate: null, timelineNote: null, priorityCode: 'normal', version: 1,
    contacts: [], scopes: [], referrers: [], intakeRecords: [], duplicateConcerns: [],
    createdAt: timestamp, updatedAt: timestamp,
  },
  intake: { runtime: { nodeInstanceId: '83000000-0000-4000-8000-000000000031', nodeExecutionId: '83000000-0000-4000-8000-000000000032', nodeKey: '01.1', nodeType: 'intake', executionNo: 1, phase: 'not_started', state: 'ready', needsRevalidation: false, startedBy: null, startedAt: null, completedBy: null, completedAt: null, version: 1, assignments: [], blockers: [] }, gates: { satisfied: false, checks: [] } },
  evaluation: { runtime: { nodeInstanceId: '83000000-0000-4000-8000-000000000033', nodeExecutionId: '83000000-0000-4000-8000-000000000034', nodeKey: '01.2', nodeType: 'evaluation', executionNo: 1, phase: 'not_started', state: 'locked', needsRevalidation: false, startedBy: null, startedAt: null, completedBy: null, completedAt: null, version: 1, assignments: [], blockers: [] }, gates: { satisfied: false, checks: [] } },
  currentDecisionCycle: { id: '83000000-0000-4000-8000-000000000035', opportunityId, nodeExecutionId: '83000000-0000-4000-8000-000000000034', cycleNo: 1, decisionAuthorityUserId: null, authorityResolutionReference: null, reactivationReason: null, finalOutcome: null, finalDecisionBy: null, finalDecisionAt: null, finalRationale: null, finalRecommendationId: null, overrideRationale: null, version: 1, evaluations: [], recommendations: [], clarificationReturns: [], createdAt: timestamp },
  actorCapabilities: [],
})

describe('HTTP Stage 01 repository', () => {
  it('rejects the legacy GET response shape that lacks operational read-model fields', async () => {
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(legacyDetail))
    const repository = createHttpStage01Repository({ companyId, client: { request } as never })

    await expect(repository.get(opportunityId)).rejects.toBeDefined()
  })

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
