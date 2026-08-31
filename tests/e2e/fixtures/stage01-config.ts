import type { Page } from '@playwright/test'
import {
  createStage01ConfigDraftInputSchema,
  discardStage01ConfigDraftInputSchema,
  publishStage01ConfigDraftInputSchema,
  publishStage01ConfigResultSchema,
  stage01BusinessConfigViewSchema,
  stage01ConfigDraftSchema,
  updateStage01ConfigDraftInputSchema,
  type Stage01BusinessConfigView,
} from '../../../shared/schemas/stage01-config'
import { apiErrorBodySchema } from '../../../shared/schemas/api-error'

const actorId = '70000000-0000-4000-8000-000000000001'
const initialSnapshotId = '70000000-0000-4000-8000-000000000010'
const draftId = '70000000-0000-4000-8000-000000000020'
const timestamp = '2026-08-31T00:00:00.000Z'

export type Stage01ConfigRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body: unknown
}

export type Stage01ConfigNextFailure = 409 | 403 | 500

export interface Stage01ConfigRouteState {
  view: Stage01BusinessConfigView
  requests: Stage01ConfigRequest[]
  nextFailure: Stage01ConfigNextFailure | null
  initialConfigUnavailable: boolean
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function snapshotIdFor(templateVersion: number): string {
  return `70000000-0000-4000-8000-${String(templateVersion).padStart(12, '0')}`
}

function failureBody(status: Stage01ConfigNextFailure) {
  const code = status === 409
    ? 'VERSION_CONFLICT'
    : status === 403
      ? 'PERMISSION_DENIED'
      : 'INTERNAL_ERROR'
  const message = status === 409
    ? 'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.'
    : status === 403
      ? 'Bạn không có quyền thực hiện thao tác này.'
      : 'Không thể hoàn tất yêu cầu kiểm thử.'

  return apiErrorBodySchema.parse({
    error: {
      code,
      message,
      requestId: `stage01-e2e-${status}`,
      details: {},
    },
  })
}

function configUnavailableBody() {
  return apiErrorBodySchema.parse({
    error: {
      code: 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE',
      message: 'Cấu hình định nghĩa Stage 01 chưa sẵn sàng.',
      requestId: 'stage01-e2e-definition-unavailable',
      details: {},
    },
  })
}

function createDraft(view: Stage01BusinessConfigView) {
  return stage01ConfigDraftSchema.parse({
    id: draftId,
    baseSnapshotId: view.published.snapshotId,
    version: 0,
    createdBy: actorId,
    createdAt: timestamp,
    updatedBy: actorId,
    updatedAt: timestamp,
    taxonomies: clone(view.published.taxonomies),
    criteria: clone(view.published.criteria),
  })
}

export function createStage01ConfigView(): Stage01BusinessConfigView {
  return stage01BusinessConfigViewSchema.parse({
    workflowKey: 'vqh.stage01',
    published: {
      snapshotId: initialSnapshotId,
      templateVersion: 1,
      schemaVersion: 1,
      definitionHash: 'stage01-config-v1',
      publishedAt: timestamp,
      taxonomies: {
        customer_type: [{ code: 'customer', label: 'Khách hàng' }],
        contact_relationship: [{ code: 'primary_contact', label: 'Người liên hệ chính' }],
        scope: [{ code: 'full_design', label: 'Thiết kế trọn gói' }],
        lead_source: [{ code: 'referral', label: 'Giới thiệu', behavior: { requiresReferrer: true } }],
        referrer_type: [{ code: 'partner', label: 'Đối tác' }],
        engagement_status: [{ code: 'active', label: 'Đang trao đổi' }],
        invalid_reason: [{ code: 'out_of_scope', label: 'Ngoài phạm vi' }],
        budget_status: [{ code: 'unknown', label: 'Chưa xác định' }],
        timeline_status: [{ code: 'unknown', label: 'Chưa xác định' }],
        priority: [{ code: 'normal', label: 'Bình thường' }],
        intake_channel: [{ code: 'phone', label: 'Điện thoại' }],
        blocker_category: [{ code: 'follow_up', label: 'Chờ theo dõi' }],
      },
      criteria: [
        ['customer_need', 'Nhu cầu khách hàng'],
        ['scope_capability', 'Khả năng đáp ứng phạm vi'],
        ['resources_schedule', 'Nguồn lực và tiến độ'],
        ['commercial_viability', 'Tính khả thi thương mại'],
        ['risk_special_conditions', 'Rủi ro và điều kiện đặc biệt'],
      ].map(([dimensionKey, label], index) => ({
        key: dimensionKey,
        dimensionKey,
        label,
        description: `${label} đã được xác định.`,
        criticality: 'required',
        applicabilityMode: 'always',
        allowsNotApplicable: false,
        displayOrder: index + 1,
      })),
      system: {
        nodes: [{ key: '01.1' }, { key: '01.2' }],
        dependencies: [{ from: '01.1', to: '01.2', requires: 'completed_current_valid' }],
        dimensions: [
          'customer_need',
          'scope_capability',
          'resources_schedule',
          'commercial_viability',
          'risk_special_conditions',
        ],
        capabilities: { start: 'journey.node.start' },
        gates: { intake: ['approved_minimum'] },
      },
    },
    draft: null,
  })
}

export async function installStage01ConfigRoutes(page: Page, state: Stage01ConfigRouteState): Promise<void> {
  await page.route(/\/api\/companies\/[^/]+\/stage-01\/config(?:\/draft(?:\/publish)?)?$/, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method() as Stage01ConfigRequest['method']
    const body = method === 'GET' ? undefined : request.postDataJSON()
    state.requests.push({ method, path: url.pathname, body: clone(body) })

    if (state.nextFailure !== null) {
      const status = state.nextFailure
      state.nextFailure = null
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(failureBody(status)) })
      return
    }

    const isBasePath = /\/stage-01\/config$/u.test(url.pathname)
    const isDraftPath = /\/stage-01\/config\/draft$/u.test(url.pathname)
    const isPublishPath = /\/stage-01\/config\/draft\/publish$/u.test(url.pathname)

    if (method === 'GET' && isBasePath) {
      if (state.initialConfigUnavailable) {
        state.initialConfigUnavailable = false
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(configUnavailableBody()) })
        return
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(stage01BusinessConfigViewSchema.parse(state.view)) })
      return
    }

    if (method === 'POST' && isDraftPath) {
      const input = createStage01ConfigDraftInputSchema.parse(body)
      if (state.view.draft || input.expectedPublishedSnapshotId !== state.view.published.snapshotId) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(failureBody(409)) })
        return
      }
      const draft = createDraft(state.view)
      state.view = stage01BusinessConfigViewSchema.parse({ ...state.view, draft })
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(draft) })
      return
    }

    if (method === 'PUT' && isDraftPath) {
      const input = updateStage01ConfigDraftInputSchema.parse(body)
      const draft = state.view.draft
      if (!draft || input.expectedDraftVersion !== draft.version) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(failureBody(409)) })
        return
      }
      const nextDraft = stage01ConfigDraftSchema.parse({
        ...draft,
        version: draft.version + 1,
        updatedAt: timestamp,
        taxonomies: input.taxonomies,
        criteria: input.criteria,
      })
      state.view = stage01BusinessConfigViewSchema.parse({ ...state.view, draft: nextDraft })
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(nextDraft) })
      return
    }

    if (method === 'DELETE' && isDraftPath) {
      const input = discardStage01ConfigDraftInputSchema.parse(body)
      if (!state.view.draft || input.expectedDraftVersion !== state.view.draft.version) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(failureBody(409)) })
        return
      }
      state.view = stage01BusinessConfigViewSchema.parse({ ...state.view, draft: null })
      await route.fulfill({ contentType: 'application/json', body: 'null' })
      return
    }

    if (method === 'POST' && isPublishPath) {
      const input = publishStage01ConfigDraftInputSchema.parse(body)
      const draft = state.view.draft
      if (!draft || input.expectedDraftVersion !== draft.version) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(failureBody(409)) })
        return
      }
      const templateVersion = state.view.published.templateVersion + 1
      const result = publishStage01ConfigResultSchema.parse({
        snapshotId: snapshotIdFor(templateVersion),
        templateVersion,
        schemaVersion: state.view.published.schemaVersion,
        definitionHash: `stage01-config-v${templateVersion}`,
        publishedAt: timestamp,
      })
      state.view = stage01BusinessConfigViewSchema.parse({
        ...state.view,
        published: {
          ...state.view.published,
          ...result,
          taxonomies: clone(draft.taxonomies),
          criteria: clone(draft.criteria),
        },
        draft: null,
      })
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) })
      return
    }

    await route.fallback()
  })
}
