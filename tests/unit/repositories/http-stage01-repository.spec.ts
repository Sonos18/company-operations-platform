import { describe, expect, it, vi } from 'vitest'
import { createHttpStage01Repository } from '../../../app/repositories/http/http-stage01-repository'
import { createAuthenticatedHttpClient } from '../../../app/repositories/http/authenticated-http-client'
import { stage01DetailSchema } from '../../../shared/schemas/stage01'
import { stage01OperationalDetailSchema } from '../../../shared/schemas/stage01-operational'

const companyId = '83000000-0000-4000-8000-000000000020'
const opportunityId = '83000000-0000-4000-8000-000000000030'
const timestamp = '2026-08-31T00:00:00.000Z'
const criteria = [
  'customer_need',
  'scope_capability',
  'resources_schedule',
  'commercial_viability',
  'risk_special_conditions',
].map((dimensionKey, index) => ({
  key: dimensionKey,
  dimensionKey,
  label: `Criterion ${index + 1}`,
  description: `Description ${index + 1}`,
  criticality: 'required' as const,
  applicabilityMode: 'always' as const,
  allowsNotApplicable: false,
  displayOrder: index + 1,
}))
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

  it('preserves the bound blocker category through the authenticated HTTP parsing boundary', async () => {
    const responseDetail = stage01OperationalDetailSchema.parse({
      ...legacyDetail,
      configuration: {
        taxonomies: {
          customer_type: [{ code: 'customer', label: 'Customer' }],
          contact_relationship: [{ code: 'primary_contact', label: 'Primary contact' }],
          scope: [{ code: 'scope', label: 'Scope' }],
          lead_source: [{ code: 'referral', label: 'Referral' }],
          referrer_type: [{ code: 'partner', label: 'Partner' }],
          engagement_status: [{ code: 'active', label: 'Active' }],
          invalid_reason: [{ code: 'invalid', label: 'Invalid' }],
          budget_status: [{ code: 'known', label: 'Known' }],
          timeline_status: [{ code: 'known', label: 'Known' }],
          priority: [{ code: 'normal', label: 'Normal' }],
          intake_channel: [{ code: 'phone', label: 'Phone' }],
          blocker_category: [{ code: 'reserved_follow_up', label: 'Cần theo dõi thêm' }],
        },
        criteria,
      },
      relatedContacts: [],
      decisionCycles: [legacyDetail.currentDecisionCycle],
    })
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'test-access-token',
      fetch: async () => new Response(JSON.stringify(responseDetail), { status: 200 }),
    })
    const repository = createHttpStage01Repository({ companyId, client })

    const detail = await repository.get(opportunityId)

    expect(detail.configuration.taxonomies.blocker_category).toEqual([
      { code: 'reserved_follow_up', label: 'Cần theo dõi thêm' },
    ])
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

  it('uses the explicit decision-cycle policy-binding endpoint with a versioned transition body', async () => {
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(null))
    const repository = createHttpStage01Repository({ companyId, client: { request } as never })
    const cycleId = '83000000-0000-4000-8000-000000000035'
    const input = {
      requestId: '83000000-0000-4000-8000-000000000036', expectedCycleVersion: 2,
      transitionCode: 'b4_acceptance_policy_transition' as const,
      reason: 'Bind VQH Decision Policy v1 for this unresolved acceptance cycle.',
    }
    await repository.transitionDecisionPolicy(opportunityId, cycleId, input)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: `/api/companies/${companyId}/opportunities/${opportunityId}/decision-cycles/${cycleId}/policy-binding`,
      method: 'POST', body: input,
    }))
  })
})
