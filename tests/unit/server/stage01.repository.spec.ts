import { describe, expect, it, vi } from 'vitest'
import { createSupabaseStage01Repository } from '../../../server/features/stage01/stage01.repository'

const state = vi.hoisted(() => ({ opportunity: null as unknown, runtime: null as unknown }))

vi.mock('../../../server/features/opportunities/opportunity.repository', () => ({
  createSupabaseOpportunityRepository: () => ({ getById: async () => state.opportunity }),
}))
vi.mock('../../../server/features/workflow/workflow.repository', () => ({
  createSupabaseWorkflowRepository: () => ({ getForOpportunity: async () => state.runtime }),
}))

const id = (suffix: number) => `63000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const timestamp = '2026-08-31T00:00:00.000Z'
const taxonomyKeys = ['customer_type', 'contact_relationship', 'scope', 'lead_source', 'referrer_type', 'engagement_status', 'invalid_reason', 'budget_status', 'timeline_status', 'priority', 'intake_channel', 'blocker_category'] as const
const dimensions = ['customer_need', 'scope_capability', 'resources_schedule', 'commercial_viability', 'risk_special_conditions'] as const

type QueryResult = { data: unknown, error: unknown }

function query(
  initial: QueryResult,
  onEq?: (column: string, value: unknown) => QueryResult | undefined,
  onOrder?: (column: string) => QueryResult | undefined,
) {
  let result = initial
  const value = {
    select: () => value,
    eq: (column: string, filter: unknown) => { result = onEq?.(column, filter) ?? result; return value },
    order: (column: string) => { result = onOrder?.(column) ?? result; return value },
    limit: () => value,
    maybeSingle: async () => result,
    then: <TResult1 = { data: unknown, error: unknown }, TResult2 = never>(resolve?: ((value: { data: unknown, error: unknown }) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) => Promise.resolve(result).then(resolve, reject),
  }
  return value
}

describe('Stage 01 Decision repository', () => {
  it('reads the runtime-bound definition, related contacts, and ordered decision-cycle history', async () => {
    const companyId = id(20)
    const opportunityId = id(30)
    const boundSnapshotId = id(40)
    const contactId = id(50)
    const cycleOne = id(60)
    const cycleTwo = id(61)
    const newerSnapshotId = id(41)
    state.opportunity = {
      id: opportunityId, validityState: 'valid', canonicalOpportunityId: null, primaryCustomerName: 'Customer', customerTypeCode: 'customer', needDescription: 'Need', locationStatus: 'area_known', locationText: 'District 1', primaryLeadSourceCode: 'referral', engagementStatusCode: 'active', budgetStatusCode: null, budgetMin: null, budgetMax: null, currencyCode: null, budgetNote: null, timelineStatusCode: null, timelineStartDate: null, timelineEndDate: null, timelineNote: null, priorityCode: null, version: 1,
      contacts: [{ id: id(51), opportunityId, contactId, relationshipCode: 'primary_contact', isPrimary: true, reliabilityState: 'confirmed', createdAt: timestamp, endedAt: null, endReason: null }], scopes: [], referrers: [], intakeRecords: [], duplicateConcerns: [], createdAt: timestamp, updatedAt: timestamp,
    }
    const node = (key: '01.1' | '01.2', suffix: number) => ({ nodeInstanceId: id(suffix + 100), nodeKey: key, nodeExecutionId: id(suffix), nodeType: key === '01.1' ? 'intake' : 'evaluation', executionNo: 1, assignments: [], blockers: [], phase: 'not_started', state: key === '01.1' ? 'ready' : 'locked', needsRevalidation: false, startedBy: null, startedAt: null, completedBy: null, completedAt: null, version: 1 })
    state.runtime = { definitionSnapshotId: boundSnapshotId, nodes: [node('01.1', 70), node('01.2', 71)] }
    const cycle = (cycleId: string, cycleNo: number) => ({
      id: cycleId, opportunity_id: opportunityId, node_execution_id: id(71), cycle_no: cycleNo, decision_authority_user_id: null, authority_resolution_reference: null, reactivation_reason: null,
      final_outcome: null, final_decision_by: null, final_decision_at: null, final_rationale: null, final_recommendation_id: null, override_rationale: null, version: 1, created_at: timestamp,
    })
    const boundTaxonomies = Object.fromEntries(taxonomyKeys.map(key => [key, [{ code: key, label: `Bound ${key}`, semanticKey: `internal.${key}`, ...(key === 'lead_source' ? { behavior: { requiresReferrer: true } } : {}) }]]))
    const newerTaxonomies = structuredClone(boundTaxonomies)
    newerTaxonomies.customer_type[0].label = 'Newer published customer type'
    const criteria = dimensions.map((dimensionKey, index) => ({ key: dimensionKey, dimensionKey, label: `Label ${index}`, description: `Description ${index}`, criticality: 'required', applicabilityMode: 'always', allowsNotApplicable: false, displayOrder: index + 1 }))
    const snapshotLookups: unknown[] = []
    const orderCalls: string[] = []
    const from = vi.fn((table: string) => {
      if (table === 'stage01_decision_cycles') return query(
        { data: [cycle(cycleTwo, 2), cycle(cycleOne, 1)], error: null },
        undefined,
        (column) => {
          orderCalls.push(column)
          return column === 'cycle_no' ? { data: [cycle(cycleOne, 1), cycle(cycleTwo, 2)], error: null } : undefined
        },
      )
      if (table === 'workflow_definition_snapshots') return query(
        { data: null, error: null },
        (column, value) => {
          if (column !== 'id') return
          snapshotLookups.push(value)
          return value === boundSnapshotId
            ? { data: { definition: { taxonomies: boundTaxonomies, criteria, capabilities: {} } }, error: null }
            : value === newerSnapshotId
              ? { data: { definition: { taxonomies: newerTaxonomies, criteria, capabilities: {} } }, error: null }
              : { data: null, error: null }
        },
      )
      if (table === 'contacts') return query({ data: { id: contactId, display_name: 'Primary contact', notes: null, version: 7, created_at: timestamp, updated_at: timestamp }, error: null })
      if (table === 'contact_methods') return query({ data: [{ id: id(80), contact_id: contactId, method_type: 'phone', value: '0900000000', is_usable: true, reliability_state: 'confirmed', created_at: timestamp, updated_at: timestamp }], error: null })
      return query({ data: [], error: null })
    })
    const repository = createSupabaseStage01Repository({ from, rpc: async () => ({ data: [{ roles: [], permissions: [] }], error: null }) } as never)

    const detail = await repository.get(companyId, opportunityId)

    expect(snapshotLookups).toEqual([boundSnapshotId])
    expect(orderCalls).toContain('cycle_no')
    expect(detail?.configuration.taxonomies.customer_type[0]).toEqual({ code: 'customer_type', label: 'Bound customer_type' })
    expect(detail?.configuration.taxonomies.customer_type[0]?.label).not.toBe('Newer published customer type')
    expect(detail?.relatedContacts).toEqual([expect.objectContaining({ id: contactId, version: 7, methods: [expect.objectContaining({ isUsable: true })] })])
    expect(detail?.decisionCycles.map(cycle => cycle.cycleNo)).toEqual([1, 2])
    expect(detail?.currentDecisionCycle.id).toBe(cycleTwo)
  })

  it('uses the fixed Final Decision RPC and maps a version conflict', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'VERSION_CONFLICT' },
    })
    const repository = createSupabaseStage01Repository({ rpc } as never)
    await expect(repository.recordFinalDecision(
      '63000000-0000-4000-8000-000000000020',
      '63000000-0000-4000-8000-000000000030',
      { expectedCycleVersion: 2, outcome: 'proceed', rationale: 'Approved' },
      '63000000-0000-4000-8000-000000000099',
    )).rejects.toMatchObject({ statusCode: 409, code: 'VERSION_CONFLICT' })
    expect(rpc).toHaveBeenCalledWith('record_stage01_final_decision', expect.objectContaining({
      target_company_id: '63000000-0000-4000-8000-000000000020',
      target_opportunity_id: '63000000-0000-4000-8000-000000000030',
    }))
  })
})
