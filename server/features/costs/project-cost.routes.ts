import type { H3Event } from 'h3'
import { getHeader, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { createProjectCostDraftInputSchema, prepareProjectCostFinancialsInputSchema, updateProjectCostDraftInputSchema } from '../../../shared/schemas/costs/project-costs'
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
    async details(event: H3Event) {
      const value = await resolved(event)
      return value.service.itemDetails(value.context, param(event, 'projectCostItemId'))
    },
  }
}

export function createSupabaseProjectCostRoutes(event: H3Event) {
  const routes = createProjectCostRoutes({ resolveContext: c1RequestContext })
  return {
    summaries: () => routes.summaries(event),
    project: () => routes.project(event),
    create: () => routes.create(event),
    patch: () => routes.patch(event),
    financials: () => routes.financials(event),
    draft: () => routes.draft(event),
    drafts: () => routes.drafts(event),
    details: () => routes.details(event),
  }
}
