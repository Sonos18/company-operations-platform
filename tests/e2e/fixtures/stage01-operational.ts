import type { Page } from '@playwright/test'
import { stage01OperationalDetailSchema, type Stage01OperationalDetail } from '../../../shared/schemas/stage01-operational'
import { apiErrorBodySchema } from '../../../shared/schemas/api-error'
import {
  addContactMethodInputSchema,
  addOpportunityReferrerInputSchema,
  addOpportunityScopeInputSchema,
  appendIntakeRecordInputSchema,
  contactMethodSchema,
  contactSchema,
  createContactInputSchema,
  createOpportunityInputSchema,
  createStage01OpportunityResultSchema,
  intakeRecordSchema,
  linkOpportunityContactInputSchema,
  opportunityContactSchema,
  opportunityReferrerSchema,
  opportunityScopeSchema,
  opportunitySummarySchema,
  setPrimaryContactInputSchema,
  setPrimaryReferrerInputSchema,
  type OpportunitySummary,
} from '../../../shared/schemas/opportunities'
import { opportunityCreateOptionsSchema } from '../../../shared/schemas/opportunity-create-options'
import type { Stage01BusinessConfigView } from '../../../shared/schemas/stage01-config'
import {
  criterionEvaluationRevisionInputSchema,
  reactivateStage01InputSchema,
  recordFinalDecisionInputSchema,
  returnForClarificationInputSchema,
  submitRecommendationInputSchema,
} from '../../../shared/schemas/stage01'
import {
  assignWorkflowNodeInputSchema,
  completeWorkflowNodeInputSchema,
  endWorkflowAssignmentInputSchema,
  raiseWorkflowBlockerInputSchema,
  reopenWorkflowNodeInputSchema,
  resolveWorkflowBlockerInputSchema,
  revalidateWorkflowNodeInputSchema,
  startWorkflowNodeInputSchema,
} from '../../../shared/schemas/workflow'
import { evaluateStage01EvaluationGates, evaluateStage01IntakeGates } from '../../../server/features/stage01/stage01-gates'

export const stage01OpportunityId = '81000000-0000-4000-8000-000000000001'
const timestamp = '2026-09-01T00:00:00.000Z'

export interface WorkflowCommandRequest {
  method: string
  pathname: string
  body: Record<string, unknown>
}

export interface Stage01CommandRequest {
  method: string
  pathname: string
  body: Record<string, unknown>
}

export interface Stage01OperationalRouteOptions {
  onCanonicalRead?: () => void
  onWorkflowCommand?: (request: WorkflowCommandRequest) => void | Promise<void>
  onStage01Command?: (request: Stage01CommandRequest) => void | Promise<void>
  requireOverrideRationaleOnce?: boolean
}

export interface Stage01OperationalRouteState {
  opportunities: OpportunitySummary[]
  detail: Stage01OperationalDetail
  currentPublishedConfig: Stage01BusinessConfigView
  requests: Array<{ method: string, path: string, body: unknown }>
  nextFailure: null | 403 | 409 | 500
}

function refreshStage01Gates(detail: Stage01OperationalDetail): void {
  const primaryContact = detail.opportunity.contacts.find(contact => contact.isPrimary && contact.endedAt === null)
  const usableContactMethodCount = primaryContact === undefined
    ? 0
    : detail.relatedContacts.find(contact => contact.id === primaryContact.contactId)?.methods.filter(method => method.isUsable).length ?? 0
  const leadSourceRequiresReferrer = detail.configuration.taxonomies.lead_source
    .find(value => value.code === detail.opportunity.primaryLeadSourceCode)?.behavior?.requiresReferrer === true

  detail.intake.gates = evaluateStage01IntakeGates({
    validityState: detail.opportunity.validityState,
    hasIntakeOwner: detail.intake.runtime.assignments.some(assignment => assignment.assignmentKind === 'accountable_owner' && assignment.endedAt === null),
    primaryCustomerName: detail.opportunity.primaryCustomerName,
    customerTypeCode: detail.opportunity.customerTypeCode,
    hasActivePrimaryContact: primaryContact !== undefined,
    primaryContactRelationshipCode: primaryContact?.relationshipCode ?? null,
    usableContactMethodCount,
    activeScopeCount: detail.opportunity.scopes.filter(scope => scope.retiredAt === null).length,
    needDescription: detail.opportunity.needDescription,
    locationStatus: detail.opportunity.locationStatus,
    primaryLeadSourceCode: detail.opportunity.primaryLeadSourceCode,
    leadSourceRequiresReferrer,
    activePrimaryReferrerCount: detail.opportunity.referrers.filter(referrer => referrer.isPrimary && referrer.endedAt === null).length,
    engagementStatusCode: detail.opportunity.engagementStatusCode,
    intakeRecordCount: detail.opportunity.intakeRecords.length,
    openBlockingBlockerCount: detail.intake.runtime.blockers.filter(blocker => blocker.effect === 'blocking' && blocker.resolvedAt === null).length,
    unresolvedDuplicateConcernCount: detail.opportunity.duplicateConcerns.filter(concern => concern.resolvedAt === null).length,
  })
  detail.evaluation.gates = evaluateStage01EvaluationGates({
    criterionDefinitions: detail.configuration.criteria.map(criterion => ({
      key: criterion.key,
      criticality: criterion.criticality,
      allowsNotApplicable: criterion.allowsNotApplicable,
    })),
    evaluations: detail.currentDecisionCycle.evaluations,
    recommendations: detail.currentDecisionCycle.recommendations,
    clarificationReturns: detail.currentDecisionCycle.clarificationReturns,
    intakeDependencyCurrentlyValid: detail.intake.runtime.phase === 'completed' && !detail.intake.runtime.needsRevalidation,
    hasOpenBlockingBlocker: detail.evaluation.runtime.blockers.some(blocker => blocker.effect === 'blocking' && blocker.resolvedAt === null),
    needsRevalidation: detail.evaluation.runtime.needsRevalidation,
    finalOutcome: detail.currentDecisionCycle.finalOutcome,
  })
}

function mutationTimestamp(state: Stage01OperationalRouteState): string {
  return new Date(Date.parse(timestamp) + state.requests.length * 1000).toISOString()
}

function clearCreatedOpportunityRelations(detail: Stage01OperationalDetail): void {
  detail.opportunity.contacts = []
  detail.opportunity.scopes = []
  detail.opportunity.referrers = []
  detail.opportunity.intakeRecords = []
  detail.opportunity.duplicateConcerns = []
  detail.relatedContacts = []
  detail.intake.runtime.assignments = []
}

export function createStage01OperationalDetail(): Stage01OperationalDetail {
  const intakeExecutionId = '81000000-0000-4000-8000-000000000010'
  const evaluationExecutionId = '81000000-0000-4000-8000-000000000011'
  const cycleId = '81000000-0000-4000-8000-000000000012'
  const detail = stage01OperationalDetailSchema.parse({
    opportunity: {
      id: stage01OpportunityId, validityState: 'valid', canonicalOpportunityId: null,
      primaryCustomerName: 'Công ty Việt Quốc Huy', customerTypeCode: 'business',
      needDescription: 'Thiết kế văn phòng mới', locationStatus: 'area_known', locationText: 'Quận 1',
      primaryLeadSourceCode: 'referral', engagementStatusCode: 'active', budgetStatusCode: 'unknown',
      budgetMin: null, budgetMax: null, currencyCode: null, budgetNote: null,
      timelineStatusCode: 'unknown', timelineStartDate: null, timelineEndDate: null, timelineNote: null,
      priorityCode: 'normal', version: 3,
      contacts: [{ id: '81000000-0000-4000-8000-000000000020', opportunityId: stage01OpportunityId, contactId: '81000000-0000-4000-8000-000000000021', relationshipCode: 'primary_contact', isPrimary: true, reliabilityState: 'confirmed', createdAt: timestamp, endedAt: null, endReason: null }],
      scopes: [{ id: '81000000-0000-4000-8000-000000000022', opportunityId: stage01OpportunityId, scopeCode: 'full_design', note: null, reliabilityState: 'confirmed', createdAt: timestamp, retiredAt: null, retireReason: null }],
      referrers: [{ id: '81000000-0000-4000-8000-000000000023', opportunityId: stage01OpportunityId, referrerTypeCode: 'partner', displayName: 'Đối tác giới thiệu', contactId: null, note: null, reliabilityState: 'confirmed', isPrimary: true, createdAt: timestamp, endedAt: null, endReason: null }],
      intakeRecords: [{ id: '81000000-0000-4000-8000-000000000024', opportunityId: stage01OpportunityId, channelCode: 'phone', summary: 'Trao đổi nhu cầu ban đầu', correctionOfRecordId: null, correctionReason: null, createdAt: timestamp }],
      duplicateConcerns: [{ id: '81000000-0000-4000-8000-000000000025', opportunityId: stage01OpportunityId, suspectedDuplicateOpportunityId: null, description: 'Cần đối chiếu', resolution: null, canonicalOpportunityId: null, resolutionNote: null, raisedAt: timestamp, resolvedAt: null }],
      createdAt: timestamp, updatedAt: timestamp,
    },
    intake: { runtime: { nodeInstanceId: '81000000-0000-4000-8000-000000000030', nodeExecutionId: intakeExecutionId, nodeKey: '01.1', nodeType: 'intake', executionNo: 1, phase: 'active', state: 'active', needsRevalidation: false, startedBy: null, startedAt: null, completedBy: null, completedAt: null, version: 2, assignments: [], blockers: [] }, gates: { satisfied: false, checks: [{ code: 'primary_contact', status: 'missing', message: 'Cần liên hệ chính' }] } },
    evaluation: { runtime: { nodeInstanceId: '81000000-0000-4000-8000-000000000031', nodeExecutionId: evaluationExecutionId, nodeKey: '01.2', nodeType: 'evaluation', executionNo: 1, phase: 'not_started', state: 'locked', needsRevalidation: false, startedBy: null, startedAt: null, completedBy: null, completedAt: null, version: 0, assignments: [], blockers: [] }, gates: { satisfied: false, checks: [{ code: 'intake', status: 'missing', message: 'Chờ tiếp nhận' }] } },
    currentDecisionCycle: { id: cycleId, opportunityId: stage01OpportunityId, nodeExecutionId: evaluationExecutionId, cycleNo: 1, decisionAuthorityUserId: null, authorityResolutionReference: null, reactivationReason: null, finalOutcome: null, finalDecisionBy: null, finalDecisionAt: null, finalRationale: null, finalRecommendationId: null, overrideRationale: null, version: 0, evaluations: [], recommendations: [], clarificationReturns: [], createdAt: timestamp },
    actorCapabilities: [],
    configuration: { taxonomies: {
      customer_type: [{ code: 'business', label: 'Doanh nghiệp' }], contact_relationship: [{ code: 'primary_contact', label: 'Liên hệ chính' }], scope: [{ code: 'full_design', label: 'Thiết kế trọn gói' }], lead_source: [{ code: 'referral', label: 'Giới thiệu', behavior: { requiresReferrer: true } }], referrer_type: [{ code: 'partner', label: 'Đối tác' }], engagement_status: [{ code: 'active', label: 'Đang trao đổi' }], invalid_reason: [{ code: 'out_of_scope', label: 'Ngoài phạm vi' }], budget_status: [{ code: 'unknown', label: 'Chưa xác định' }], timeline_status: [{ code: 'unknown', label: 'Chưa xác định' }], priority: [{ code: 'normal', label: 'Bình thường' }], intake_channel: [{ code: 'phone', label: 'Điện thoại' }], blocker_category: [{ code: 'follow_up', label: 'Chờ theo dõi' }],
    }, criteria: [
      ['customer_need', 'Nhu cầu khách hàng'], ['scope_capability', 'Khả năng đáp ứng phạm vi'], ['resources_schedule', 'Nguồn lực và tiến độ'], ['commercial_viability', 'Tính khả thi thương mại'], ['risk_special_conditions', 'Rủi ro và điều kiện đặc biệt'],
    ].map(([dimensionKey, label], index) => ({ key: dimensionKey, dimensionKey, label, description: 'Đã xác định.', criticality: 'required', applicabilityMode: 'always', allowsNotApplicable: false, displayOrder: index + 1 })) },
    relatedContacts: [{ id: '81000000-0000-4000-8000-000000000021', displayName: 'Chị Lan', notes: null, version: 4, methods: [{ id: '81000000-0000-4000-8000-000000000026', contactId: '81000000-0000-4000-8000-000000000021', methodType: 'phone', value: '0900000000', isUsable: true, reliabilityState: 'confirmed', createdAt: timestamp, updatedAt: timestamp }], createdAt: timestamp, updatedAt: timestamp }],
    decisionCycles: [{ id: cycleId, opportunityId: stage01OpportunityId, nodeExecutionId: evaluationExecutionId, cycleNo: 1, decisionAuthorityUserId: null, authorityResolutionReference: null, reactivationReason: null, finalOutcome: null, finalDecisionBy: null, finalDecisionAt: null, finalRationale: null, finalRecommendationId: null, overrideRationale: null, version: 0, evaluations: [], recommendations: [], clarificationReturns: [], createdAt: timestamp }],
  })
  detail.decisionCycles = [detail.currentDecisionCycle]
  return detail
}

export function createStage01OperationalRouteState(): Stage01OperationalRouteState {
  const detail = createStage01OperationalDetail()
  refreshStage01Gates(detail)
  return {
    opportunities: [opportunitySummarySchema.parse({
      id: detail.opportunity.id,
      validityState: detail.opportunity.validityState,
      canonicalOpportunityId: detail.opportunity.canonicalOpportunityId,
      primaryCustomerName: detail.opportunity.primaryCustomerName,
      needDescription: detail.opportunity.needDescription,
      version: detail.opportunity.version,
      createdAt: detail.opportunity.createdAt,
      updatedAt: detail.opportunity.updatedAt,
    })],
    detail,
    currentPublishedConfig: {
      workflowKey: 'vqh.stage01',
      published: {
        snapshotId: '82000000-0000-4000-8000-000000000001',
        templateVersion: 1,
        schemaVersion: 1,
        definitionHash: 'stage01-browser-fixture',
        publishedAt: timestamp,
        taxonomies: detail.configuration.taxonomies,
        criteria: detail.configuration.criteria,
        system: {
          nodes: [], dependencies: [],
          dimensions: ['customer_need', 'scope_capability', 'resources_schedule', 'commercial_viability', 'risk_special_conditions'],
          capabilities: {}, gates: {},
        },
      },
      draft: null,
    },
    requests: [],
    nextFailure: null,
  }
}

function routeBody(route: Parameters<Parameters<Page['route']>[1]>[0]): Record<string, unknown> {
  return JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
}

function fixtureId(sequence: number): string {
  return `82000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
}

function failureBody(status: 403 | 409 | 500) {
  const error = status === 403
    ? { code: 'PERMISSION_DENIED', message: 'Không có quyền thực hiện thao tác.', requestId: 'stage01-fixture-forbidden' }
    : status === 409
      ? { code: 'VERSION_CONFLICT', message: 'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.', requestId: 'stage01-fixture-conflict' }
      : { code: 'INTERNAL_ERROR', message: 'Lỗi kiểm thử.', requestId: 'stage01-fixture-error' }
  return apiErrorBodySchema.parse({ error: { ...error, details: {} } })
}

async function fulfillPendingFailure(route: Parameters<Parameters<Page['route']>[1]>[0], state: Stage01OperationalRouteState): Promise<boolean> {
  const status = state.nextFailure
  if (status === null) return false
  state.nextFailure = null
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(failureBody(status)) })
  return true
}

/**
 * Stateful, no-Cloud browser fixture for the public endpoints consumed by the B3 pages.
 * Every command body is parsed by the shared contract before this fixture changes state.
 */
export async function installStatefulStage01OperationalRoutes(
  page: Page,
  state = createStage01OperationalRouteState(),
): Promise<void> {
  await page.route(/\/api\/companies\/[^/]+\/opportunities(?:\/.*)?$/, async route => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (/\/stage-01(?:\/|$)/u.test(pathname)) return route.fallback()

    if (pathname.endsWith('/create-options') && request.method() === 'GET') {
      const response = opportunityCreateOptionsSchema.parse({
        workflowKey: state.currentPublishedConfig.workflowKey,
        publishedSnapshotId: state.currentPublishedConfig.published.snapshotId,
        taxonomies: {
          customer_type: state.currentPublishedConfig.published.taxonomies.customer_type,
          lead_source: state.currentPublishedConfig.published.taxonomies.lead_source,
          engagement_status: state.currentPublishedConfig.published.taxonomies.engagement_status,
          budget_status: state.currentPublishedConfig.published.taxonomies.budget_status,
          timeline_status: state.currentPublishedConfig.published.taxonomies.timeline_status,
          priority: state.currentPublishedConfig.published.taxonomies.priority,
        },
      })
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) })
      return
    }
    if (/\/opportunities$/u.test(pathname) && request.method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(state.opportunities) })
      return
    }
    if (/\/opportunities$/u.test(pathname) && request.method() === 'POST') {
      const input = createOpportunityInputSchema.parse(routeBody(route))
      state.requests.push({ method: request.method(), path: pathname, body: input })
      if (await fulfillPendingFailure(route, state)) return
      Object.assign(state.detail.opportunity, {
        primaryCustomerName: input.primaryCustomerName,
        customerTypeCode: input.customerTypeCode ?? null,
        needDescription: input.needDescription ?? null,
        locationStatus: input.locationStatus ?? 'unknown',
        locationText: input.locationText ?? null,
        primaryLeadSourceCode: input.primaryLeadSourceCode ?? null,
        engagementStatusCode: input.engagementStatusCode ?? null,
        version: 0,
      })
      clearCreatedOpportunityRelations(state.detail)
      refreshStage01Gates(state.detail)
      state.opportunities = [opportunitySummarySchema.parse({
        id: state.detail.opportunity.id, validityState: state.detail.opportunity.validityState,
        canonicalOpportunityId: state.detail.opportunity.canonicalOpportunityId,
        primaryCustomerName: state.detail.opportunity.primaryCustomerName,
        needDescription: state.detail.opportunity.needDescription, version: state.detail.opportunity.version,
        createdAt: state.detail.opportunity.createdAt, updatedAt: state.detail.opportunity.updatedAt,
      })]
      const result = createStage01OpportunityResultSchema.parse({
        opportunityId: state.detail.opportunity.id,
        workflowInstanceId: fixtureId(2),
        intakeNodeInstanceId: state.detail.intake.runtime.nodeInstanceId,
        intakeExecutionId: state.detail.intake.runtime.nodeExecutionId,
        evaluationNodeInstanceId: state.detail.evaluation.runtime.nodeInstanceId,
        evaluationExecutionId: state.detail.evaluation.runtime.nodeExecutionId,
        decisionCycleId: state.detail.currentDecisionCycle.id,
        opportunityVersion: state.detail.opportunity.version,
        intakeExecutionVersion: state.detail.intake.runtime.version,
        evaluationExecutionVersion: state.detail.evaluation.runtime.version,
        decisionCycleVersion: state.detail.currentDecisionCycle.version,
      })
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) })
      return
    }
    if (/\/opportunities\/[^/]+\/intake-records$/u.test(pathname) && request.method() === 'POST') {
      const input = appendIntakeRecordInputSchema.parse(routeBody(route))
      state.requests.push({ method: request.method(), path: pathname, body: input })
      if (await fulfillPendingFailure(route, state)) return
      const record = intakeRecordSchema.parse({
        id: fixtureId(600 + state.detail.opportunity.intakeRecords.length),
        opportunityId: state.detail.opportunity.id,
        channelCode: input.channelCode,
        summary: input.summary,
        correctionOfRecordId: null,
        correctionReason: null,
        createdAt: timestamp,
      })
      state.detail.opportunity.intakeRecords.push(record)
      state.detail.opportunity.version += 1
      refreshStage01Gates(state.detail)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(record) })
      return
    }
    return route.fallback()
  })

  await page.route(/\/api\/companies\/[^/]+\/(?:contacts(?:\/[^/]+\/methods)?|opportunities\/[^/]+\/(?:contacts|primary-contact|scopes|referrers|primary-referrer))$/, async route => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fallback()
    const pathname = new URL(request.url()).pathname
    const body = routeBody(route)
    state.requests.push({ method: request.method(), path: pathname, body })
    if (await fulfillPendingFailure(route, state)) return

    if (/\/contacts$/u.test(pathname) && !pathname.includes('/opportunities/')) {
      const input = createContactInputSchema.parse(body)
      const contact = contactSchema.parse({
        id: fixtureId(1000 + state.detail.relatedContacts.length), displayName: input.displayName,
        notes: input.notes ?? null, version: 0, methods: [], createdAt: mutationTimestamp(state), updatedAt: mutationTimestamp(state),
      })
      state.detail.relatedContacts.push(contact)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(contact) })
      return
    }

    if (/\/contacts\/[^/]+\/methods$/u.test(pathname)) {
      const input = addContactMethodInputSchema.parse(body)
      const contactId = decodeURIComponent(pathname.split('/').at(-2)!)
      const contact = state.detail.relatedContacts.find(item => item.id === contactId)
      if (!contact) throw new Error(`Unknown contact ${contactId}`)
      const method = contactMethodSchema.parse({
        id: fixtureId(1100 + contact.methods.length), contactId, methodType: input.methodType, value: input.value,
        isUsable: input.isUsable, reliabilityState: input.reliabilityState ?? null, createdAt: mutationTimestamp(state), updatedAt: mutationTimestamp(state),
      })
      contact.methods.push(method)
      contact.version += 1
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(method) })
      return
    }

    if (/\/opportunities\/[^/]+\/contacts$/u.test(pathname)) {
      const input = linkOpportunityContactInputSchema.parse(body)
      if (input.isPrimary) state.detail.opportunity.contacts.forEach(item => { item.isPrimary = false })
      const relationship = opportunityContactSchema.parse({
        id: fixtureId(1200 + state.detail.opportunity.contacts.length), opportunityId: state.detail.opportunity.id,
        contactId: input.contactId, relationshipCode: input.relationshipCode, isPrimary: input.isPrimary ?? false,
        reliabilityState: input.reliabilityState ?? null, createdAt: mutationTimestamp(state), endedAt: null, endReason: null,
      })
      state.detail.opportunity.contacts.push(relationship)
      state.detail.opportunity.version += 1
      refreshStage01Gates(state.detail)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(relationship) })
      return
    }

    if (pathname.endsWith('/primary-contact')) {
      const input = setPrimaryContactInputSchema.parse(body)
      const relationship = state.detail.opportunity.contacts.find(item => item.contactId === input.contactId && item.endedAt === null)
      if (!relationship) throw new Error(`Unknown active contact ${input.contactId}`)
      state.detail.opportunity.contacts.forEach(item => { item.isPrimary = item.id === relationship.id })
      relationship.relationshipCode = input.relationshipCode
      relationship.reliabilityState = input.reliabilityState ?? null
      state.detail.opportunity.version += 1
      refreshStage01Gates(state.detail)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(opportunityContactSchema.parse(relationship)) })
      return
    }

    if (/\/opportunities\/[^/]+\/scopes$/u.test(pathname)) {
      const input = addOpportunityScopeInputSchema.parse(body)
      const scope = opportunityScopeSchema.parse({
        id: fixtureId(1300 + state.detail.opportunity.scopes.length), opportunityId: state.detail.opportunity.id,
        scopeCode: input.scopeCode, note: input.note ?? null, reliabilityState: input.reliabilityState ?? null,
        createdAt: mutationTimestamp(state), retiredAt: null, retireReason: null,
      })
      state.detail.opportunity.scopes.push(scope)
      state.detail.opportunity.version += 1
      refreshStage01Gates(state.detail)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(scope) })
      return
    }

    if (/\/opportunities\/[^/]+\/referrers$/u.test(pathname)) {
      const input = addOpportunityReferrerInputSchema.parse(body)
      if (input.isPrimary) state.detail.opportunity.referrers.forEach(item => { item.isPrimary = false })
      const referrer = opportunityReferrerSchema.parse({
        id: fixtureId(1400 + state.detail.opportunity.referrers.length), opportunityId: state.detail.opportunity.id,
        referrerTypeCode: input.referrerTypeCode, displayName: input.displayName, contactId: input.contactId ?? null,
        note: input.note ?? null, reliabilityState: input.reliabilityState ?? null, isPrimary: input.isPrimary ?? false,
        createdAt: mutationTimestamp(state), endedAt: null, endReason: null,
      })
      state.detail.opportunity.referrers.push(referrer)
      state.detail.opportunity.version += 1
      refreshStage01Gates(state.detail)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(referrer) })
      return
    }

    if (pathname.endsWith('/primary-referrer')) {
      const input = setPrimaryReferrerInputSchema.parse(body)
      const referrer = state.detail.opportunity.referrers.find(item => item.endedAt === null && item.referrerTypeCode === input.referrerTypeCode && item.displayName === input.displayName)
      if (!referrer) throw new Error(`Unknown active referrer ${input.displayName}`)
      state.detail.opportunity.referrers.forEach(item => { item.isPrimary = item.id === referrer.id })
      referrer.contactId = input.contactId ?? null
      referrer.note = input.note ?? null
      referrer.reliabilityState = input.reliabilityState ?? null
      state.detail.opportunity.version += 1
      refreshStage01Gates(state.detail)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(opportunityReferrerSchema.parse(referrer)) })
      return
    }

    return route.fallback()
  })

  await page.route(/\/api\/companies\/[^/]+\/(?:workflow-nodes|workflow-assignments|workflow-blockers)\//, async route => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fallback()
    const pathname = new URL(request.url()).pathname
    const body = routeBody(route)
    const runtime = pathname.includes(state.detail.intake.runtime.nodeExecutionId) ? state.detail.intake.runtime : state.detail.evaluation.runtime
    let assignmentInput: ReturnType<typeof assignWorkflowNodeInputSchema.parse> | null = null
    let blockerInput: ReturnType<typeof raiseWorkflowBlockerInputSchema.parse> | null = null
    let blockerResolutionInput: ReturnType<typeof resolveWorkflowBlockerInputSchema.parse> | null = null
    let assignmentEndInput: ReturnType<typeof endWorkflowAssignmentInputSchema.parse> | null = null
    if (pathname.endsWith('/start')) startWorkflowNodeInputSchema.parse(body)
    else if (pathname.endsWith('/complete')) completeWorkflowNodeInputSchema.parse(body)
    else if (pathname.endsWith('/reopen')) reopenWorkflowNodeInputSchema.parse(body)
    else if (pathname.endsWith('/revalidate')) revalidateWorkflowNodeInputSchema.parse(body)
    else if (pathname.endsWith('/assignments')) assignmentInput = assignWorkflowNodeInputSchema.parse(body)
    else if (pathname.endsWith('/end')) assignmentEndInput = endWorkflowAssignmentInputSchema.parse(body)
    else if (pathname.endsWith('/blockers')) blockerInput = raiseWorkflowBlockerInputSchema.parse(body)
    else if (pathname.endsWith('/resolve')) blockerResolutionInput = resolveWorkflowBlockerInputSchema.parse(body)
    else return route.fallback()
    state.requests.push({ method: request.method(), path: pathname, body })
    if (await fulfillPendingFailure(route, state)) return
    if (pathname.endsWith('/start')) {
      runtime.phase = 'active'; runtime.state = 'active'; runtime.version += 1
    }
    else if (pathname.endsWith('/complete')) {
      runtime.phase = 'completed'; runtime.state = 'completed'; runtime.version += 1
      if (runtime.nodeKey === '01.1') {
        state.detail.evaluation.runtime.phase = 'not_started'
        state.detail.evaluation.runtime.state = 'ready'
      }
    }
    else if (pathname.endsWith('/reopen')) {
      runtime.phase = 'active'; runtime.state = 'active'; runtime.needsRevalidation = false; runtime.version += 1
    }
    else if (pathname.endsWith('/revalidate')) {
      runtime.needsRevalidation = false; runtime.version += 1
    }
    else if (pathname.endsWith('/assignments')) {
      if (!assignmentInput) throw new Error('Assignment input was not parsed')
      runtime.assignments.push({
        id: fixtureId(700 + runtime.assignments.length),
        nodeExecutionId: runtime.nodeExecutionId,
        assignmentKind: assignmentInput.assignmentKind,
        assigneeUserId: assignmentInput.assigneeUserId,
        assignedBy: fixtureId(900),
        assignedAt: mutationTimestamp(state),
        assignmentReason: assignmentInput.assignmentReason ?? null,
        endedBy: null,
        endedAt: null,
        endReason: null,
      })
      runtime.version += 1
    }
    else if (pathname.endsWith('/end')) {
      if (!assignmentEndInput) throw new Error('Assignment end input was not parsed')
      const assignmentId = pathname.split('/').at(-2)!
      const assignment = [...state.detail.intake.runtime.assignments, ...state.detail.evaluation.runtime.assignments]
        .find(item => item.id === assignmentId)
      if (!assignment) throw new Error(`Unknown assignment ${assignmentId}`)
      assignment.endedBy = fixtureId(900)
      assignment.endedAt = mutationTimestamp(state)
      assignment.endReason = assignmentEndInput.endReason
    }
    else if (pathname.endsWith('/blockers')) {
      if (!blockerInput) throw new Error('Blocker input was not parsed')
      runtime.blockers.push({
        id: fixtureId(800 + runtime.blockers.length),
        nodeExecutionId: runtime.nodeExecutionId,
        effect: blockerInput.effect,
        categoryCode: blockerInput.categoryCode,
        description: blockerInput.description,
        raisedBy: fixtureId(900),
        raisedAt: mutationTimestamp(state),
        responsibleUserId: blockerInput.responsibleUserId ?? null,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null,
        version: 0,
      })
      runtime.version += 1
    }
    else if (pathname.endsWith('/resolve')) {
      if (!blockerResolutionInput) throw new Error('Blocker resolution input was not parsed')
      const blockerId = pathname.split('/').at(-2)!
      const blocker = [...state.detail.intake.runtime.blockers, ...state.detail.evaluation.runtime.blockers]
        .find(item => item.id === blockerId)
      if (!blocker) throw new Error(`Unknown blocker ${blockerId}`)
      blocker.resolvedBy = fixtureId(900)
      blocker.resolvedAt = mutationTimestamp(state)
      blocker.resolution = blockerResolutionInput.resolution
      blocker.version += 1
    }
    refreshStage01Gates(state.detail)
    await route.fulfill({ contentType: 'application/json', body: pathname.endsWith('/start') || pathname.endsWith('/complete') || pathname.endsWith('/reopen') || pathname.endsWith('/revalidate') ? JSON.stringify(runtime) : 'null' })
  })

  await page.route(/\/api\/companies\/[^/]+\/opportunities\/[^/]+\/stage-01\/(?:evaluations\/[^/]+\/revisions|recommendations|clarification-returns|final-decision|reactivate)$/, async route => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fallback()
    const pathname = new URL(request.url()).pathname
    const body = routeBody(route)
    const cycle = state.detail.currentDecisionCycle
    if (/\/evaluations\/[^/]+\/revisions$/u.test(pathname)) {
      const input = criterionEvaluationRevisionInputSchema.parse(body)
      state.requests.push({ method: request.method(), path: pathname, body: input })
      if (await fulfillPendingFailure(route, state)) return
      const criterionKey = decodeURIComponent(pathname.split('/').at(-2)!)
      cycle.evaluations.push({ id: fixtureId(100 + cycle.evaluations.length), decisionCycleId: cycle.id, criterionKey, revision: cycle.evaluations.filter(item => item.criterionKey === criterionKey).length + 1, applicability: input.applicability, result: input.result, rationale: input.rationale || null, evidence: input.evidence, evaluatedBy: fixtureId(900), evaluatedAt: mutationTimestamp(state) })
      cycle.version += 1
    }
    else if (pathname.endsWith('/recommendations')) {
      const input = submitRecommendationInputSchema.parse(body)
      state.requests.push({ method: request.method(), path: pathname, body: input })
      if (await fulfillPendingFailure(route, state)) return
      cycle.recommendations.push({ id: fixtureId(200 + cycle.recommendations.length), decisionCycleId: cycle.id, version: cycle.recommendations.length + 1, recommendation: input.recommendation, rationale: input.rationale, evidence: input.evidence, submittedBy: fixtureId(900), submittedAt: mutationTimestamp(state) })
      cycle.version += 1
    }
    else if (pathname.endsWith('/clarification-returns')) {
      const input = returnForClarificationInputSchema.parse(body)
      state.requests.push({ method: request.method(), path: pathname, body: input })
      if (await fulfillPendingFailure(route, state)) return
      cycle.clarificationReturns.push({ id: fixtureId(300 + cycle.clarificationReturns.length), decisionCycleId: cycle.id, recommendationId: input.recommendationId, reason: input.reason, returnedBy: fixtureId(900), returnedAt: mutationTimestamp(state) })
      cycle.version += 1
    }
    else if (pathname.endsWith('/final-decision')) {
      const input = recordFinalDecisionInputSchema.parse(body)
      state.requests.push({ method: request.method(), path: pathname, body: input })
      if (await fulfillPendingFailure(route, state)) return
      cycle.finalOutcome = input.outcome; cycle.finalRationale = input.rationale; cycle.overrideRationale = input.overrideRationale ?? null
      cycle.finalDecisionBy = fixtureId(900); cycle.finalDecisionAt = timestamp
      cycle.finalRecommendationId = cycle.recommendations.at(-1)?.id ?? null; cycle.version += 1
    }
    else {
      const input = reactivateStage01InputSchema.parse(body)
      state.requests.push({ method: request.method(), path: pathname, body: input })
      if (await fulfillPendingFailure(route, state)) return
      const previous = structuredClone(cycle)
      const current = structuredClone(cycle)
      current.id = fixtureId(400 + state.detail.decisionCycles.length)
      current.nodeExecutionId = fixtureId(500 + state.detail.decisionCycles.length)
      current.cycleNo = previous.cycleNo + 1; current.reactivationReason = input.reason
      current.finalOutcome = null; current.finalDecisionBy = null; current.finalDecisionAt = null; current.finalRationale = null
      current.finalRecommendationId = null; current.overrideRationale = null; current.version = 0
      current.evaluations = []; current.recommendations = []; current.clarificationReturns = []
      state.detail.decisionCycles = [...state.detail.decisionCycles.slice(0, -1), previous, current]
      state.detail.currentDecisionCycle = current
      state.detail.evaluation.runtime.nodeExecutionId = current.nodeExecutionId
      state.detail.evaluation.runtime.executionNo += 1; state.detail.evaluation.runtime.version = 0
      state.detail.evaluation.runtime.phase = 'active'; state.detail.evaluation.runtime.state = 'active'
    }
    refreshStage01Gates(state.detail)
    await route.fulfill({ contentType: 'application/json', body: 'null' })
  })

  await page.route(/\/api\/companies\/[^/]+\/opportunities\/[^/]+\/stage-01$/, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    refreshStage01Gates(state.detail)
    const parsed = stage01OperationalDetailSchema.parse(state.detail)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(parsed) })
  })
}

export async function installStage01OperationalRoutes(
  page: Page,
  detail = createStage01OperationalDetail(),
  options: Stage01OperationalRouteOptions = {},
): Promise<void> {
  await page.route(/\/api\/companies\/[^/]+\/(?:workflow-nodes|workflow-assignments|workflow-blockers)\//, async route => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fallback()
    const pathname = new URL(request.url()).pathname
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
    await options.onWorkflowCommand?.({ method: request.method(), pathname, body })
    const executionId = pathname.split('/').find(segment => segment === detail.intake.runtime.nodeExecutionId || segment === detail.evaluation.runtime.nodeExecutionId)
    if (executionId && /\/(?:start|complete|reopen|revalidate)$/u.test(pathname)) {
      const runtime = executionId === detail.intake.runtime.nodeExecutionId ? detail.intake.runtime : detail.evaluation.runtime
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(runtime) })
      return
    }
    await route.fulfill({ contentType: 'application/json', body: 'null' })
  })
  await page.route(/\/api\/companies\/[^/]+\/opportunities(?:\/[^/]+)?(?:\/.*)?$/, async route => {
    const request = route.request()
    if (/\/stage-01$/u.test(new URL(request.url()).pathname)) return route.fallback()
    if (request.method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
      return
    }
    await route.fulfill({ contentType: 'application/json', body: 'null' })
  })
  let overrideRationaleRequired = options.requireOverrideRationaleOnce === true
  await page.route(/\/api\/companies\/[^/]+\/opportunities\/[^/]+\/stage-01\/(?:evaluations\/[^/]+\/revisions|recommendations|clarification-returns|final-decision|reactivate)$/, async route => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fallback()
    const pathname = new URL(request.url()).pathname
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
    await options.onStage01Command?.({ method: request.method(), pathname, body })
    if (overrideRationaleRequired && pathname.endsWith('/final-decision')) {
      overrideRationaleRequired = false
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(overrideRationaleRequiredBody()) })
      return
    }
    await route.fulfill({ contentType: 'application/json', body: 'null' })
  })
  await page.route(/\/api\/companies\/[^/]+\/opportunities\/[^/]+\/stage-01$/, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    options.onCanonicalRead?.()
    const parsed = stage01OperationalDetailSchema.safeParse(detail)
    if (!parsed.success) throw new Error(`Invalid Stage 01 operational fixture: ${JSON.stringify(parsed.error.issues)}`)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(parsed.data) })
  })
}

export function versionConflictBody() {
  return apiErrorBodySchema.parse({ error: { code: 'VERSION_CONFLICT', message: 'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.', requestId: 'stage01-version-conflict', details: {} } })
}

export function overrideRationaleRequiredBody() {
  return apiErrorBodySchema.parse({ error: { code: 'STAGE01_OVERRIDE_RATIONALE_REQUIRED', message: 'Cần ghi rõ lý do ghi đè quyết định.', requestId: 'stage01-override-rationale-required', details: {} } })
}
