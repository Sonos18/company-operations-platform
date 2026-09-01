import { describe, expect, it } from 'vitest'
import { stage01OperationalDetailSchema } from '../../../shared/schemas/stage01-operational'

const id = (suffix: number) => `81000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const timestamp = '2026-08-31T00:00:00.000Z'
const opportunityId = id(1)
const evaluationExecutionId = id(5)
const dimensions = ['customer_need', 'scope_capability', 'resources_schedule', 'commercial_viability', 'risk_special_conditions'] as const
const taxonomyKeys = ['customer_type', 'contact_relationship', 'scope', 'lead_source', 'referrer_type', 'engagement_status', 'invalid_reason', 'budget_status', 'timeline_status', 'priority', 'intake_channel', 'blocker_category'] as const

function cycle(cycleNo: number) {
  return {
    id: id(20 + cycleNo), opportunityId, nodeExecutionId: evaluationExecutionId, cycleNo,
    decisionAuthorityUserId: null, authorityResolutionReference: null, reactivationReason: null,
    finalOutcome: null, finalDecisionBy: null, finalDecisionAt: null, finalRationale: null,
    finalRecommendationId: null, overrideRationale: null, version: 1,
    evaluations: [], recommendations: [], clarificationReturns: [], createdAt: timestamp,
  }
}

const firstCycle = cycle(1)
const secondCycle = cycle(2)
const operationalDetail = {
  opportunity: {
    id: opportunityId, validityState: 'valid', canonicalOpportunityId: null,
    primaryCustomerName: 'Customer', customerTypeCode: 'customer', needDescription: 'Need',
    locationStatus: 'area_known', locationText: 'District 1', primaryLeadSourceCode: 'referral', engagementStatusCode: 'active',
    budgetStatusCode: null, budgetMin: null, budgetMax: null, currencyCode: null, budgetNote: null,
    timelineStatusCode: null, timelineStartDate: null, timelineEndDate: null, timelineNote: null, priorityCode: null,
    version: 1, contacts: [], scopes: [], referrers: [], intakeRecords: [], duplicateConcerns: [], createdAt: timestamp, updatedAt: timestamp,
  },
  intake: { runtime: { nodeInstanceId: id(2), nodeExecutionId: id(3), nodeKey: '01.1', nodeType: 'intake', executionNo: 1, phase: 'not_started', state: 'ready', needsRevalidation: false, startedBy: null, startedAt: null, completedBy: null, completedAt: null, version: 1, assignments: [], blockers: [] }, gates: { satisfied: false, checks: [] } },
  evaluation: { runtime: { nodeInstanceId: id(4), nodeExecutionId: evaluationExecutionId, nodeKey: '01.2', nodeType: 'evaluation', executionNo: 1, phase: 'not_started', state: 'locked', needsRevalidation: false, startedBy: null, startedAt: null, completedBy: null, completedAt: null, version: 1, assignments: [], blockers: [] }, gates: { satisfied: false, checks: [] } },
  currentDecisionCycle: secondCycle,
  actorCapabilities: [],
  configuration: {
    taxonomies: Object.fromEntries(taxonomyKeys.map(key => [key, [{ code: key, label: `Label ${key}`, ...(key === 'lead_source' ? { behavior: { requiresReferrer: true } } : {}) }]])),
    criteria: dimensions.map((dimensionKey, index) => ({ key: dimensionKey, dimensionKey, label: `Label ${index}`, description: `Description ${index}`, criticality: 'required', applicabilityMode: 'always', allowsNotApplicable: false, displayOrder: index + 1 })),
  },
  relatedContacts: [],
  decisionCycles: [firstCycle, secondCycle],
}

describe('Stage 01 operational detail schema', () => {
  // Defect caught: a response can expose a stale current cycle while presenting newer decision history.
  it('rejects a current decision cycle that is not the final history entry', () => {
    expect(stage01OperationalDetailSchema.safeParse(operationalDetail).success).toBe(true)
    expect(stage01OperationalDetailSchema.safeParse({ ...operationalDetail, currentDecisionCycle: firstCycle }).success).toBe(false)
  })
})
