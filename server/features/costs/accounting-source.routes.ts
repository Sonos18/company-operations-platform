import type { H3Event } from 'h3'
import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { createAccountingSourceInputSchema, createAccountingSourceVersionInputSchema, createSourceFigureInputSchema, createSourceSelectionInputSchema, idempotencyInputSchema, updateAccountingSourceInputSchema } from '../../../shared/schemas/costs/sources'
import { AppApiError } from '../../utils/api-error'
import { c1RequestContext } from '../c1-master-data/context'
import { createSupabaseAccountingSourceRepository } from './accounting-source.repository'
import { createAccountingSourceService } from './accounting-source.service'
import { createSourceReviewService } from './source-review.service'
const uuid = z.string().uuid()
function param(event: H3Event, name: string) { const value = uuid.safeParse(getRouterParam(event, name)); if (!value.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Định danh không hợp lệ.'); return value.data }
export function createSupabaseAccountingSourceRoutes(event: H3Event) {
  async function service() { const context = await c1RequestContext(event, param(event, 'companyId')); return { context, service: createAccountingSourceService(createSupabaseAccountingSourceRepository(context.db) as never) } }
  async function review() { const context = await c1RequestContext(event, param(event, 'companyId')); return { context, service: createSourceReviewService(createSupabaseAccountingSourceRepository(context.db) as never) } }
  return {
    async list() { const value = await service(); return value.service.list(value.context) },
    async get() { const value = await service(); return value.service.get(value.context, param(event, 'sourceId')) },
    async create() { const value = await service(); return value.service.createSource(value.context, createAccountingSourceInputSchema.parse(await readBody(event))) },
    async update() { const value = await service(); return value.service.updateSource(value.context, param(event, 'sourceId'), updateAccountingSourceInputSchema.parse(await readBody(event))) },
    async createVersion() { const value = await service(); return value.service.createVersion(value.context, param(event, 'sourceId'), createAccountingSourceVersionInputSchema.parse(await readBody(event))) },
    async shareVersion() { const value = await service(); return value.service.shareVersion(value.context, param(event, 'sourceVersionId'), idempotencyInputSchema.parse(await readBody(event))) },
    async createSelection() { const value = await service(); return value.service.createSelection(value.context, param(event, 'sourceVersionId'), createSourceSelectionInputSchema.parse(await readBody(event))) },
    async createFigure() { const value = await service(); return value.service.createFigure(value.context, param(event, 'selectionId'), createSourceFigureInputSchema.parse(await readBody(event))) },
    async createIssue() { const value = await review(); return value.service.create(value.context, param(event, 'selectionId'), await readBody(event)) },
    async resolveIssue() { const value = await review(); return value.service.resolve(value.context, param(event, 'issueId'), await readBody(event)) },
  }
}
