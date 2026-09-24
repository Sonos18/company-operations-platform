import type { H3Event } from 'h3'
import { getHeader, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { correctPublishedProjectCostDetailInputSchema, correctPublishedProjectCostInputSchema, createAndPublishProjectCostDetailInputSchema, createProjectCostDetailDraftInputSchema, createProjectCostDraftInputSchema, prepareProjectCostDetailFinancialsInputSchema, prepareProjectCostFinancialsInputSchema, publishProjectCostDetailInputSchema, publishProjectCostInputSchema, updateProjectCostDetailDraftInputSchema, updateProjectCostDraftInputSchema } from '../../../shared/schemas/costs/project-costs'
import { AppApiError } from '../../utils/api-error'
import { c1RequestContext } from '../c1-master-data/context'
import { ProjectCostRepository } from './project-cost.repository'
import { ProjectCostService } from './project-cost.service'

const uuid = z.string().uuid()

export interface ProjectCostRouteDependencies {
  resolveContext(event: H3Event, companyId: string): ReturnType<typeof c1RequestContext>
  service?: ProjectCostService
}

function invalid(): never { throw new AppApiError(400, 'INPUT_INVALID', 'Định danh không hợp lệ.') }
function param(event: H3Event, name: string) { const value = uuid.safeParse(getRouterParam(event, name)); if (!value.success) invalid(); return value.data }
async function body<T>(event: H3Event, schema: z.ZodType<T>) { const value = schema.safeParse(await readBody(event)); if (!value.success) throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.'); return value.data }

export function createProjectCostRoutes(dependencies: ProjectCostRouteDependencies) {
  async function resolved(event: H3Event) {
    const context = await dependencies.resolveContext(event, param(event, 'companyId'))
    return { context, service: dependencies.service ?? new ProjectCostService(new ProjectCostRepository(context.db)) }
  }
  return {
    async summaries(event: H3Event) { const value = await resolved(event); return value.service.listSummaries(value.context) },
    async project(event: H3Event) { const value = await resolved(event); return value.service.projectSummary(value.context, param(event, 'projectId')) },
    async draftManagementMetadata(event: H3Event) { const value = await resolved(event); return value.service.draftManagementMetadata(value.context) },
    async create(event: H3Event) {
      const value = await resolved(event)
      const projectId = param(event, 'projectId')
      const input = await body(event, createProjectCostDraftInputSchema)
      const idempotencyKey = uuid.safeParse(getHeader(event, 'idempotency-key'))
      if (!idempotencyKey.success || input.projectId !== projectId) throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
      return value.service.createDraft(value.context, input, idempotencyKey.data)
    },
    async patch(event: H3Event) {
      const value = await resolved(event)
      const itemId = param(event, 'projectCostItemId')
      const input = await body(event, updateProjectCostDraftInputSchema)
      return value.service.updateDraft(value.context, itemId, input)
    },
    async financials(event: H3Event) { const value = await resolved(event); return value.service.prepareFinancials(value.context, param(event, 'projectCostItemId'), await body(event, prepareProjectCostFinancialsInputSchema)) },
    async draft(event: H3Event) { const value = await resolved(event); return value.service.draft(value.context, param(event, 'projectCostItemId')) },
    async drafts(event: H3Event) { const value = await resolved(event); return value.service.listDrafts(value.context, param(event, 'projectId')) },
    async operationalDraft(event: H3Event) { const value = await resolved(event); return value.service.operationalDraft(value.context, param(event, 'projectCostItemId')) },
    async operationalDrafts(event: H3Event) { const value = await resolved(event); return value.service.listOperationalDrafts(value.context, param(event, 'projectId')) },
    async publish(event: H3Event) {
      const value = await resolved(event)
      const itemId = param(event, 'projectCostItemId')
      const input = await body(event, publishProjectCostInputSchema)
      const idempotencyKey = uuid.safeParse(getHeader(event, 'idempotency-key'))
      if (!idempotencyKey.success) invalid()
      return value.service.publish(value.context, itemId, input, idempotencyKey.data)
    },
    async correction(event: H3Event) {
      const value = await resolved(event)
      const itemId = param(event, 'projectCostItemId')
      const input = await body(event, correctPublishedProjectCostInputSchema)
      const idempotencyKey = uuid.safeParse(getHeader(event, 'idempotency-key'))
      if (!idempotencyKey.success) invalid()
      return value.service.correctPublished(value.context, itemId, input, idempotencyKey.data)
    },
    async details(event: H3Event) {
      const value = await resolved(event)
      return value.service.itemDetails(value.context, param(event, 'projectCostItemId'))
    },
    async createDetailDraft(event: H3Event) {
      const value = await resolved(event); const projectId = param(event, 'projectId'); const input = await body(event, createProjectCostDetailDraftInputSchema)
      const idempotencyKey = uuid.safeParse(getHeader(event, 'idempotency-key'))
      if (!idempotencyKey.success || input.projectId !== projectId) invalid()
      return value.service.createDetailDraft(value.context, input, idempotencyKey.data)
    },
    async updateDetailDraft(event: H3Event) { const value = await resolved(event); return value.service.updateDetailDraft(value.context, param(event, 'detailId'), await body(event, updateProjectCostDetailDraftInputSchema)) },
    async prepareDetailFinancials(event: H3Event) { const value = await resolved(event); return value.service.prepareDetailFinancials(value.context, param(event, 'detailId'), await body(event, prepareProjectCostDetailFinancialsInputSchema)) },
    async detailDraft(event: H3Event) { const value = await resolved(event); return value.service.detailDraft(value.context, param(event, 'detailId')) },
    async listDetailDrafts(event: H3Event) { const value = await resolved(event); return value.service.listDetailDrafts(value.context, param(event, 'projectId')) },
    async operationalDetailDraft(event: H3Event) { const value = await resolved(event); return value.service.operationalDetailDraft(value.context, param(event, 'detailId')) },
    async listOperationalDetailDrafts(event: H3Event) { const value = await resolved(event); return value.service.listOperationalDetailDrafts(value.context, param(event, 'projectId')) },
    async publishDetail(event: H3Event) {
      const value = await resolved(event); const input = await body(event, publishProjectCostDetailInputSchema); const idempotencyKey = uuid.safeParse(getHeader(event, 'idempotency-key'))
      if (!idempotencyKey.success) invalid()
      return value.service.publishDetail(value.context, param(event, 'detailId'), input, idempotencyKey.data)
    },
    async createAndPublishDetail(event: H3Event) {
      const value = await resolved(event); const projectId = param(event, 'projectId'); const input = await body(event, createAndPublishProjectCostDetailInputSchema); const idempotencyKey = uuid.safeParse(getHeader(event, 'idempotency-key'))
      if (!idempotencyKey.success || input.projectId !== projectId) invalid()
      return value.service.createAndPublishDetail(value.context, input, idempotencyKey.data)
    },
    async correctPublishedDetail(event: H3Event) {
      const value = await resolved(event); const input = await body(event, correctPublishedProjectCostDetailInputSchema); const idempotencyKey = uuid.safeParse(getHeader(event, 'idempotency-key'))
      if (!idempotencyKey.success) invalid()
      return value.service.correctPublishedDetail(value.context, param(event, 'detailId'), input, idempotencyKey.data)
    },
  }
}

export function createSupabaseProjectCostRoutes(event: H3Event) {
  const routes = createProjectCostRoutes({ resolveContext: c1RequestContext })
  return {
    summaries: () => routes.summaries(event),
    project: () => routes.project(event),
    draftManagementMetadata: () => routes.draftManagementMetadata(event),
    create: () => routes.create(event),
    patch: () => routes.patch(event),
    financials: () => routes.financials(event),
    draft: () => routes.draft(event),
    drafts: () => routes.drafts(event),
    operationalDraft: () => routes.operationalDraft(event),
    operationalDrafts: () => routes.operationalDrafts(event),
    publish: () => routes.publish(event),
    correction: () => routes.correction(event),
    details: () => routes.details(event),
    createDetailDraft: () => routes.createDetailDraft(event),
    updateDetailDraft: () => routes.updateDetailDraft(event),
    prepareDetailFinancials: () => routes.prepareDetailFinancials(event),
    detailDraft: () => routes.detailDraft(event),
    listDetailDrafts: () => routes.listDetailDrafts(event),
    operationalDetailDraft: () => routes.operationalDetailDraft(event),
    listOperationalDetailDrafts: () => routes.listOperationalDetailDrafts(event),
    publishDetail: () => routes.publishDetail(event),
    createAndPublishDetail: () => routes.createAndPublishDetail(event),
    correctPublishedDetail: () => routes.correctPublishedDetail(event),
  }
}
