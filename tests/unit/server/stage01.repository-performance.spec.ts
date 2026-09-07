import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stage01OperationalDetailSchema } from '../../../shared/schemas/stage01-operational'
import { createSupabaseStage01Repository } from '../../../server/features/stage01/stage01.repository'

const timestamp = '2026-08-31T00:00:00.000Z'
const taxonomyKeys = [
  'customer_type', 'contact_relationship', 'scope', 'lead_source', 'referrer_type',
  'engagement_status', 'invalid_reason', 'budget_status', 'timeline_status', 'priority',
  'intake_channel', 'blocker_category',
] as const
const dimensions = [
  'customer_need', 'scope_capability', 'resources_schedule', 'commercial_viability',
  'risk_special_conditions',
] as const

type ProfileName = 'P1' | 'P2' | 'P3'
type Row = Record<string, unknown>
type QueryResult = { data: unknown, error: unknown }
type Call =
  | { kind: 'query', table: string, companyId?: string, inColumn?: string, inValues?: string[] }
  | { kind: 'rpc', name: string }

const id = (suffix: number) => `b4000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`

interface FixtureOptions {
  foreignRows?: boolean
  duplicateContactReference?: boolean
  malformedContact?: boolean
  cappedRows?: boolean
  historyEvaluationsPerCycle?: number
}

interface Fixture {
  companyId: string
  opportunityId: string
  calls: Call[]
  rows: Record<string, Row[]>
  cappedRows: boolean
}

function selectedRow(row: Row, columns: string): Row {
  const selected = columns.split(',').map(column => column.trim())
  return Object.fromEntries(selected.map(column => [column, row[column]]))
}

function createQuery(fixture: Fixture, table: string, columns = '*') {
  const filters: Array<{ kind: 'eq' | 'in' | 'is', column: string, value: unknown }> = []
  const orders: Array<{ column: string, ascending: boolean }> = []
  let rangeStart = 0
  let rangeEnd = Number.POSITIVE_INFINITY
  let limit: number | undefined
  let terminalResult: QueryResult | undefined

  const execute = (): QueryResult => {
    if (terminalResult) return terminalResult
    const companyFilter = filters.find(filter => filter.kind === 'eq' && filter.column === 'company_id')
    const inFilter = filters.find(filter => filter.kind === 'in')
    fixture.calls.push({
      kind: 'query', table,
      companyId: typeof companyFilter?.value === 'string' ? companyFilter.value : undefined,
      inColumn: inFilter?.column,
      inValues: Array.isArray(inFilter?.value) ? inFilter.value as string[] : undefined,
    })
    let values = [...(fixture.rows[table] ?? [])]
    for (const filter of filters) {
      if (filter.kind === 'eq') values = values.filter(row => row[filter.column] === filter.value)
      if (filter.kind === 'is') values = values.filter(row => row[filter.column] === filter.value)
      if (filter.kind === 'in') values = values.filter(row => (filter.value as unknown[]).includes(row[filter.column]))
    }
    for (const order of [...orders].reverse()) {
      values.sort((left, right) => {
        const leftValue = left[order.column]
        const rightValue = right[order.column]
        if (leftValue === rightValue) return 0
        const comparison = String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true })
        return order.ascending ? comparison : -comparison
      })
    }
    const cappedEnd = fixture.cappedRows ? Math.min(rangeEnd, rangeStart + 999) : rangeEnd
    values = values.slice(rangeStart, cappedEnd + 1)
    if (limit !== undefined) values = values.slice(0, limit)
    terminalResult = { data: values.map(row => selectedRow(row, columns)), error: null }
    return terminalResult
  }

  const query = {
    select(nextColumns: string) { columns = nextColumns; return query },
    eq(column: string, value: unknown) { filters.push({ kind: 'eq', column, value }); return query },
    in(column: string, values: string[]) { filters.push({ kind: 'in', column, value: values }); return query },
    is(column: string, value: null) { filters.push({ kind: 'is', column, value }); return query },
    order(column: string, options?: { ascending?: boolean }) {
      orders.push({ column, ascending: options?.ascending ?? true })
      return query
    },
    range(from: number, to: number) { rangeStart = from; rangeEnd = to; return query },
    limit(count: number) { limit = count; return query },
    maybeSingle: async () => {
      const result = execute()
      return {
        data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
        error: result.error,
      }
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      resolve?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(execute()).then(resolve, reject)
    },
  }
  return query
}

function createDefinition() {
  const taxonomies = Object.fromEntries(taxonomyKeys.map(key => [key, [{
    code: `${key}_code`,
    label: `${key} label`,
    ...(key === 'lead_source' ? { behavior: { requiresReferrer: true } } : {}),
  }]]))
  const criteria = dimensions.map((dimensionKey, index) => ({
    key: `${dimensionKey}_criterion`, dimensionKey, label: `Criterion ${index}`,
    description: `Description ${index}`, criticality: 'required', applicabilityMode: 'always',
    allowsNotApplicable: false, displayOrder: index + 1,
  }))
  return { taxonomies, criteria, capabilities: {} }
}

function createFixture(profile: ProfileName, options: FixtureOptions = {}): Fixture {
  const profileNumber = Number(profile.slice(1))
  const base = profileNumber * 100000
  const companyId = id(base + 1)
  const foreignCompanyId = id(base + 2)
  const opportunityId = id(base + 3)
  const workflowInstanceId = id(base + 4)
  const snapshotId = id(base + 5)
  const newerSnapshotId = id(base + 10)
  const intakeNodeId = id(base + 6)
  const evaluationNodeId = id(base + 7)
  const intakeExecutionId = id(base + 8)
  const evaluationExecutionId = id(base + 9)
  const cycleCount = profile === 'P1' ? 1 : profile === 'P2' ? 5 : 20
  const contactCount = profile === 'P1' ? 2 : profile === 'P2' ? 10 : 20
  const evaluationCount = options.historyEvaluationsPerCycle ?? (profile === 'P1' ? 5 : 6)
  const recommendationCount = profile === 'P1' ? 1 : 2
  const clarificationCount = profile === 'P1' ? 1 : 1
  const contactIds = Array.from({ length: contactCount }, (_, index) => id(base + 1000 + index))
  const cycleIds = Array.from({ length: cycleCount }, (_, index) => id(base + 2000 + index))
  const rows: Record<string, Row[]> = {}

  rows.opportunities = [{
    company_id: companyId, id: opportunityId, validity_state: 'valid', canonical_opportunity_id: null,
    primary_customer_name: 'Performance customer', customer_type_code: 'customer', need_description: 'Performance need',
    location_status: 'area_known', location_text: 'District 1', primary_lead_source_code: 'referral',
    engagement_status_code: 'active', budget_status_code: null, budget_min: null, budget_max: null, currency_code: null,
    budget_note: null, timeline_status_code: null, timeline_start_date: null, timeline_end_date: null, timeline_note: null,
    priority_code: null, version: 1, created_at: timestamp, updated_at: timestamp,
  }]
  rows.opportunity_contacts = contactIds.map((contactId, index) => ({
    company_id: companyId, id: id(base + 3000 + index), opportunity_id: opportunityId, contact_id: contactId,
    relationship_code: 'primary_contact', is_primary: index === 0, reliability_state: 'confirmed',
    created_at: timestamp, ended_at: null, end_reason: null,
  }))
  if (options.duplicateContactReference) {
    rows.opportunity_contacts.push({
      company_id: companyId, id: id(base + 4000), opportunity_id: opportunityId, contact_id: contactIds[0],
      relationship_code: 'secondary_contact', is_primary: false, reliability_state: 'confirmed',
      created_at: timestamp, ended_at: null, end_reason: null,
    })
  }
  rows.opportunity_scopes = []
  rows.opportunity_referrers = []
  rows.opportunity_intake_records = []
  rows.opportunity_duplicate_concerns = []
  rows.contacts = contactIds.map((contactId, index) => ({
    company_id: companyId, id: contactId, display_name: `Contact ${index}`, notes: null, version: 1,
    created_at: timestamp, updated_at: timestamp,
  }))
  rows.contact_methods = contactIds.map((contactId, index) => ({
    company_id: companyId, id: id(base + 5000 + index), contact_id: contactId, method_type: 'phone',
    value: `090000${String(index).padStart(4, '0')}`, is_usable: true, reliability_state: 'confirmed',
    created_at: timestamp, updated_at: timestamp,
  }))
  if (options.malformedContact) rows.contacts[0] = { ...rows.contacts[0], display_name: '' }
  rows.workflow_instances = [{
    company_id: companyId, id: workflowInstanceId, subject_type: 'opportunity', subject_id: opportunityId,
    definition_snapshot_id: snapshotId,
  }]
  rows.workflow_node_instances = [
    { company_id: companyId, id: intakeNodeId, workflow_instance_id: workflowInstanceId, node_key: '01.1', node_type: 'intake' },
    { company_id: companyId, id: evaluationNodeId, workflow_instance_id: workflowInstanceId, node_key: '01.2', node_type: 'evaluation' },
  ]
  rows.workflow_node_executions = [
    { company_id: companyId, id: intakeExecutionId, node_instance_id: intakeNodeId, execution_no: 1,
      phase: 'completed', needs_revalidation: false, started_by: id(base + 6000), started_at: timestamp,
      completed_by: id(base + 6000), completed_at: timestamp, version: 1, superseded_at: null },
    { company_id: companyId, id: evaluationExecutionId, node_instance_id: evaluationNodeId, execution_no: 1,
      phase: 'active', needs_revalidation: false, started_by: id(base + 6000), started_at: timestamp,
      completed_by: null, completed_at: null, version: 1, superseded_at: null },
  ]
  rows.workflow_node_assignments = []
  rows.workflow_blockers = []
  const boundDefinition = createDefinition()
  const newerDefinition = structuredClone(boundDefinition)
  newerDefinition.taxonomies.customer_type[0]!.label = 'Newer published customer type'
  rows.workflow_definition_snapshots = [
    { company_id: companyId, id: snapshotId, definition: boundDefinition },
    { company_id: companyId, id: newerSnapshotId, definition: newerDefinition },
  ]
  rows.stage01_decision_cycles = cycleIds.map((cycleId, index) => ({
    company_id: companyId, id: cycleId, opportunity_id: opportunityId, node_execution_id: evaluationExecutionId,
    cycle_no: index + 1, decision_authority_user_id: null, authority_resolution_event_id: null,
    authority_resolution_reference: null, reactivation_reason: null, final_outcome: null, final_decision_by: null,
    final_decision_at: null, final_rationale: null, final_recommendation_id: null, override_rationale: null,
    version: 1, created_at: timestamp,
  })).reverse()
  rows.stage01_criterion_evaluations = []
  rows.stage01_recommendations = []
  rows.stage01_clarification_returns = []
  for (let cycleIndex = 0; cycleIndex < cycleCount; cycleIndex += 1) {
    const cycleId = cycleIds[cycleIndex]!
    for (let index = evaluationCount; index >= 1; index -= 1) {
      const criterionIndex = (index - 1) % dimensions.length
      rows.stage01_criterion_evaluations.push({
        company_id: companyId, id: id(base + 10000 + cycleIndex * 1000 + index), decision_cycle_id: cycleId,
        criterion_key: `${dimensions[criterionIndex]}_criterion`, revision: Math.floor((index - 1) / dimensions.length) + 1,
        applicability: 'applicable', result: 'fit', rationale: `Evaluation ${index}`, evidence: [], evaluated_by: id(base + 6000),
        evaluated_at: `2026-08-31T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
      })
    }
    for (let index = recommendationCount; index >= 1; index -= 1) {
      rows.stage01_recommendations.push({
        company_id: companyId, id: id(base + 30000 + cycleIndex * 1000 + index), decision_cycle_id: cycleId,
        version: index, recommendation: 'recommend_proceed', rationale: `Recommendation ${index}`, evidence: [],
        submitted_by: id(base + 6000), submitted_at: `2026-08-31T01:${String(index).padStart(2, '0')}:00.000Z`,
      })
    }
    for (let index = clarificationCount; index >= 1; index -= 1) {
      rows.stage01_clarification_returns.push({
        company_id: companyId, id: id(base + 40000 + cycleIndex * 1000 + index), decision_cycle_id: cycleId,
        recommendation_id: id(base + 30000 + cycleIndex * 1000 + 1), reason: `Clarification ${index}`,
        returned_by: id(base + 6000), returned_at: `2026-08-31T02:${String(index).padStart(2, '0')}:00.000Z`,
      })
    }
  }

  if (options.foreignRows) {
    rows.opportunity_contacts.push({
      company_id: foreignCompanyId, id: id(base + 45000), opportunity_id: opportunityId, contact_id: contactIds[0],
      relationship_code: 'foreign', is_primary: false, reliability_state: 'confirmed', created_at: timestamp,
      ended_at: null, end_reason: null,
    })
    rows.contacts.push({ company_id: foreignCompanyId, id: contactIds[0], display_name: 'Foreign contact', notes: null,
      version: 1, created_at: timestamp, updated_at: timestamp })
    rows.contact_methods.push({ company_id: foreignCompanyId, id: id(base + 46000), contact_id: contactIds[0], method_type: 'email',
      value: 'foreign@example.com', is_usable: false, reliability_state: 'disputed', created_at: timestamp, updated_at: timestamp })
    rows.stage01_decision_cycles.push({ ...rows.stage01_decision_cycles[0], company_id: foreignCompanyId })
    rows.stage01_criterion_evaluations.push({ ...rows.stage01_criterion_evaluations[0], company_id: foreignCompanyId, id: id(base + 47000) })
    rows.stage01_recommendations.push({ ...rows.stage01_recommendations[0], company_id: foreignCompanyId, id: id(base + 48000) })
    rows.stage01_clarification_returns.push({ ...rows.stage01_clarification_returns[0], company_id: foreignCompanyId, id: id(base + 49000) })
  }

  const fixture: Fixture = { companyId, opportunityId, calls: [], rows, cappedRows: options.cappedRows ?? false }
  return fixture
}

function createRepository(fixture: Fixture) {
  const client = {
    from: (table: string) => createQuery(fixture, table),
    rpc: async (name: string) => {
      fixture.calls.push({ kind: 'rpc', name })
      if (name === 'get_my_company_access') {
        return { data: [{ roles: [], permissions: ['opportunity.decision.record'] }], error: null }
      }
      if (name === 'get_opportunity_decision_authority_projection') {
        return {
          data: {
            status: 'not_required', userId: null, employeeId: null, displayName: null, positionTitle: null,
            currentActorIsAuthority: false, locked: false, policyBinding: { status: 'not_required', policySnapshotId: null },
          },
          error: null,
        }
      }
      throw new Error(`Unexpected RPC ${name}`)
    },
  }
  return createSupabaseStage01Repository(client as never)
}

function queryCount(fixture: Fixture) {
  return fixture.calls.length
}

function field<T>(row: Row, key: string): T {
  return row[key] as T
}

function assertSemanticMappings(parsed: ReturnType<typeof stage01OperationalDetailSchema.parse>, fixture: Fixture) {
  const companyRows = (table: string) => (fixture.rows[table] ?? []).filter(row => row.company_id === fixture.companyId)
  const expectedContacts = companyRows('contacts').sort((left, right) => field<string>(left, 'id').localeCompare(field<string>(right, 'id'), undefined, { numeric: true })).map(row => ({
    id: field<string>(row, 'id'), displayName: field<string>(row, 'display_name'), notes: field<string | null>(row, 'notes'),
    version: field<number>(row, 'version'), methods: companyRows('contact_methods')
      .filter(method => field<string>(method, 'contact_id') === field<string>(row, 'id'))
      .sort((left, right) => {
        const timeComparison = field<string>(left, 'created_at').localeCompare(field<string>(right, 'created_at'))
        return timeComparison || field<string>(left, 'id').localeCompare(field<string>(right, 'id'), undefined, { numeric: true })
      })
      .map(method => ({
        id: field<string>(method, 'id'), contactId: field<string>(method, 'contact_id'), methodType: field<'phone' | 'email' | 'other'>(method, 'method_type'),
        value: field<string>(method, 'value'), isUsable: field<boolean>(method, 'is_usable'), reliabilityState: field<'unverified' | 'confirmed' | 'disputed' | null>(method, 'reliability_state'),
        createdAt: field<string>(method, 'created_at'), updatedAt: field<string>(method, 'updated_at'),
      })),
    createdAt: field<string>(row, 'created_at'), updatedAt: field<string>(row, 'updated_at'),
  }))
  expect(parsed.relatedContacts).toEqual(expectedContacts)

  expect(parsed.opportunity.contacts).toEqual(companyRows('opportunity_contacts').map(row => ({
    id: field<string>(row, 'id'), opportunityId: field<string>(row, 'opportunity_id'), contactId: field<string>(row, 'contact_id'),
    relationshipCode: field<string>(row, 'relationship_code'), isPrimary: field<boolean>(row, 'is_primary'), reliabilityState: field<'unverified' | 'confirmed' | 'disputed' | null>(row, 'reliability_state'),
    createdAt: field<string>(row, 'created_at'), endedAt: field<string | null>(row, 'ended_at'), endReason: field<string | null>(row, 'end_reason'),
  })))

  const expectedCycles = companyRows('stage01_decision_cycles').sort((left, right) => field<number>(left, 'cycle_no') - field<number>(right, 'cycle_no'))
  expect(parsed.decisionCycles.map(cycle => ({
    id: cycle.id, opportunityId: cycle.opportunityId, nodeExecutionId: cycle.nodeExecutionId, cycleNo: cycle.cycleNo,
    decisionAuthorityUserId: cycle.decisionAuthorityUserId, authorityResolutionEventId: cycle.authorityResolutionEventId,
    authorityResolutionReference: cycle.authorityResolutionReference, reactivationReason: cycle.reactivationReason,
    finalOutcome: cycle.finalOutcome, finalDecisionBy: cycle.finalDecisionBy, finalDecisionAt: cycle.finalDecisionAt,
    finalRationale: cycle.finalRationale, finalRecommendationId: cycle.finalRecommendationId, overrideRationale: cycle.overrideRationale,
    version: cycle.version, createdAt: cycle.createdAt,
  }))).toEqual(expectedCycles.map(row => ({
    id: field<string>(row, 'id'), opportunityId: field<string>(row, 'opportunity_id'), nodeExecutionId: field<string>(row, 'node_execution_id'), cycleNo: field<number>(row, 'cycle_no'),
    decisionAuthorityUserId: field<string | null>(row, 'decision_authority_user_id'), authorityResolutionEventId: field<string | null>(row, 'authority_resolution_event_id'),
    authorityResolutionReference: field<string | null>(row, 'authority_resolution_reference'), reactivationReason: field<string | null>(row, 'reactivation_reason'),
    finalOutcome: field<'proceed' | 'not_proceeding' | null>(row, 'final_outcome'), finalDecisionBy: field<string | null>(row, 'final_decision_by'), finalDecisionAt: field<string | null>(row, 'final_decision_at'),
    finalRationale: field<string | null>(row, 'final_rationale'), finalRecommendationId: field<string | null>(row, 'final_recommendation_id'), overrideRationale: field<string | null>(row, 'override_rationale'),
    version: field<number>(row, 'version'), createdAt: field<string>(row, 'created_at'),
  })))
  for (const [index, sourceCycle] of expectedCycles.entries()) {
    const cycle = parsed.decisionCycles[index]!
    const cycleId = field<string>(sourceCycle, 'id')
    const expectedEvaluations = companyRows('stage01_criterion_evaluations').filter(row => row.decision_cycle_id === cycleId)
      .sort((left, right) => field<string>(left, 'evaluated_at').localeCompare(field<string>(right, 'evaluated_at')) || field<string>(left, 'id').localeCompare(field<string>(right, 'id'), undefined, { numeric: true }))
      .map(row => ({
        id: field<string>(row, 'id'), decisionCycleId: field<string>(row, 'decision_cycle_id'), criterionKey: field<string>(row, 'criterion_key'), revision: field<number>(row, 'revision'),
        applicability: field<'applicable' | 'not_applicable'>(row, 'applicability'), result: field<'fit' | 'concern' | 'not_fit' | 'insufficient_information' | null>(row, 'result'), rationale: field<string | null>(row, 'rationale'), evidence: field<unknown[]>(row, 'evidence'),
        evaluatedBy: field<string>(row, 'evaluated_by'), evaluatedAt: field<string>(row, 'evaluated_at'),
      }))
    const expectedRecommendations = companyRows('stage01_recommendations').filter(row => row.decision_cycle_id === cycleId)
      .sort((left, right) => field<number>(left, 'version') - field<number>(right, 'version'))
      .map(row => ({
        id: field<string>(row, 'id'), decisionCycleId: field<string>(row, 'decision_cycle_id'), version: field<number>(row, 'version'), recommendation: field<'recommend_proceed' | 'recommend_not_proceeding'>(row, 'recommendation'),
        rationale: field<string>(row, 'rationale'), evidence: field<unknown[]>(row, 'evidence'), submittedBy: field<string>(row, 'submitted_by'), submittedAt: field<string>(row, 'submitted_at'),
      }))
    const expectedClarifications = companyRows('stage01_clarification_returns').filter(row => row.decision_cycle_id === cycleId)
      .sort((left, right) => field<string>(left, 'returned_at').localeCompare(field<string>(right, 'returned_at')) || field<string>(left, 'id').localeCompare(field<string>(right, 'id'), undefined, { numeric: true }))
      .map(row => ({
        id: field<string>(row, 'id'), decisionCycleId: field<string>(row, 'decision_cycle_id'), recommendationId: field<string>(row, 'recommendation_id'), reason: field<string>(row, 'reason'),
        returnedBy: field<string>(row, 'returned_by'), returnedAt: field<string>(row, 'returned_at'),
      }))
    expect(cycle.evaluations).toEqual(expectedEvaluations)
    expect(cycle.recommendations).toEqual(expectedRecommendations)
    expect(cycle.clarificationReturns).toEqual(expectedClarifications)
  }
}

function assertProfileShape(detail: unknown, fixture: Fixture, profile: ProfileName, contactCount: number, cycleCount: number) {
  const parsed = stage01OperationalDetailSchema.parse(detail)
  expect(parsed.relatedContacts).toHaveLength(contactCount)
  expect(parsed.relatedContacts.map(contact => contact.id)).toEqual([...parsed.relatedContacts].map(contact => contact.id).sort())
  expect(parsed.decisionCycles.map(cycle => cycle.cycleNo)).toEqual(Array.from({ length: cycleCount }, (_, index) => index + 1))
  expect(parsed.currentDecisionCycle.id).toBe(parsed.decisionCycles.at(-1)?.id)
  for (const cycle of parsed.decisionCycles) {
    expect(cycle.evaluations.map(evaluation => evaluation.revision)).toEqual(
      [...cycle.evaluations].map(evaluation => evaluation.revision).sort((left, right) => left - right),
    )
    expect(cycle.recommendations.map(recommendation => recommendation.version)).toEqual(
      [...cycle.recommendations].map(recommendation => recommendation.version).sort((left, right) => left - right),
    )
    expect(cycle.clarificationReturns.map(returned => returned.returnedAt)).toEqual(
      [...cycle.clarificationReturns].map(returned => returned.returnedAt).sort(),
    )
  }
  expect(parsed.opportunity.id).toBe(id(profile === 'P1' ? 100003 : profile === 'P2' ? 200003 : 300003))
  assertSemanticMappings(parsed, fixture)
  expect(parsed.configuration.taxonomies.customer_type[0]).toEqual({ code: 'customer_type_code', label: 'customer_type label' })
  expect(parsed.actorCapabilities).toEqual(['decision'])
  expect(parsed.currentDecisionCycle.decisionAuthority).toEqual({
    status: 'not_required', userId: null, employeeId: null, displayName: null, positionTitle: null,
    currentActorIsAuthority: false, locked: false, policyBinding: { status: 'not_required', policySnapshotId: null },
  })
  return parsed
}

describe('Stage 01 repository operational aggregate performance', () => {
  it('measures real delegated repository reads for P1, P2, and P3 and preserves the aggregate shape', async () => {
    const profiles: Record<ProfileName, { requestCount: number, responseBytes: number }> = {} as Record<ProfileName, { requestCount: number, responseBytes: number }>
    for (const profile of ['P1', 'P2', 'P3'] as const) {
      const fixture = createFixture(profile, { foreignRows: true, duplicateContactReference: true })
      const detail = await createRepository(fixture).get(fixture.companyId, fixture.opportunityId)
      const parsed = assertProfileShape(detail, fixture, profile, profile === 'P1' ? 2 : profile === 'P2' ? 10 : 20, profile === 'P1' ? 1 : profile === 'P2' ? 5 : 20)
      expect(parsed.opportunity.contacts.some(contact => contact.relationshipCode === 'foreign')).toBe(false)
      const batchCalls = fixture.calls.filter((call): call is Extract<Call, { kind: 'query' }> => call.kind === 'query' && [
        'contacts', 'contact_methods', 'stage01_criterion_evaluations', 'stage01_recommendations', 'stage01_clarification_returns',
      ].includes(call.table))
      expect(batchCalls).toHaveLength(5)
      expect(batchCalls.every(call => call.companyId === fixture.companyId)).toBe(true)
      expect(batchCalls.map(call => `${call.table}:${call.inColumn}`).sort()).toEqual([
        'contacts:id', 'contact_methods:contact_id', 'stage01_clarification_returns:decision_cycle_id',
        'stage01_criterion_evaluations:decision_cycle_id', 'stage01_recommendations:decision_cycle_id',
      ].sort())
      profiles[profile] = { requestCount: queryCount(fixture), responseBytes: Buffer.byteLength(JSON.stringify(parsed)) }
    }
    mkdirSync(resolve('test-results/b4-stage01'), { recursive: true })
    writeFileSync(resolve('test-results/b4-stage01/request-count.json'), JSON.stringify({ profiles, requestLimit: 25 }, null, 2))
    expect(profiles.P3.requestCount).toBeLessThanOrEqual(25)
  })

  it('skips batched contact reads when the opportunity has no contacts', async () => {
    const fixture = createFixture('P1')
    fixture.rows.opportunity_contacts = []
    fixture.rows.contacts = []
    fixture.rows.contact_methods = []
    const detail = await createRepository(fixture).get(fixture.companyId, fixture.opportunityId)
    expect(detail?.relatedContacts).toEqual([])
    expect(fixture.calls.filter(call => call.kind === 'query' && (call.table === 'contacts' || call.table === 'contact_methods'))).toHaveLength(0)
  })

  it('retains all history when a batched resource exceeds the Supabase 1000-row response cap', async () => {
    const fixture = createFixture('P3', { cappedRows: true, historyEvaluationsPerCycle: 51 })
    const detail = await createRepository(fixture).get(fixture.companyId, fixture.opportunityId)
    const parsed = stage01OperationalDetailSchema.parse(detail)
    expect(parsed.decisionCycles).toHaveLength(20)
    expect(parsed.decisionCycles.reduce((total, cycle) => total + cycle.evaluations.length, 0)).toBe(1020)
    expect(fixture.calls.filter(call => call.kind === 'query' && call.table === 'stage01_criterion_evaluations')).toHaveLength(2)
  })

  it('keeps missing and malformed related data as database errors', async () => {
    const missingFixture = createFixture('P1')
    missingFixture.rows.contacts = []
    await expect(createRepository(missingFixture).get(missingFixture.companyId, missingFixture.opportunityId)).rejects.toMatchObject({ statusCode: 500 })

    const malformedFixture = createFixture('P1', { malformedContact: true })
    await expect(createRepository(malformedFixture).get(malformedFixture.companyId, malformedFixture.opportunityId)).rejects.toMatchObject({ statusCode: 500 })
  })
})
