import type { Page } from '@playwright/test'
import { stage01OperationalDetailSchema, type Stage01OperationalDetail } from '../../../shared/schemas/stage01-operational'
import { apiErrorBodySchema } from '../../../shared/schemas/api-error'

export const stage01OpportunityId = '81000000-0000-4000-8000-000000000001'
const timestamp = '2026-09-01T00:00:00.000Z'

export interface WorkflowCommandRequest {
  method: string
  pathname: string
  body: Record<string, unknown>
}

export interface Stage01OperationalRouteOptions {
  onCanonicalRead?: () => void
  onWorkflowCommand?: (request: WorkflowCommandRequest) => void | Promise<void>
}

export function createStage01OperationalDetail(): Stage01OperationalDetail {
  const intakeExecutionId = '81000000-0000-4000-8000-000000000010'
  const evaluationExecutionId = '81000000-0000-4000-8000-000000000011'
  const cycleId = '81000000-0000-4000-8000-000000000012'
  return stage01OperationalDetailSchema.parse({
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
}

export async function installStage01OperationalRoutes(
  page: Page,
  detail = createStage01OperationalDetail(),
  options: Stage01OperationalRouteOptions = {},
): Promise<void> {
  await page.route(/\/api\/companies\/[^/]+\/opportunities\/[^/]+\/stage-01$/, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    options.onCanonicalRead?.()
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(detail) })
  })
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
}

export function versionConflictBody() {
  return apiErrorBodySchema.parse({ error: { code: 'VERSION_CONFLICT', message: 'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.', requestId: 'stage01-version-conflict', details: {} } })
}
