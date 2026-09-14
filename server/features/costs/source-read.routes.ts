import type { H3Event } from 'h3'
import { getQuery, getRouterParam } from 'h3'
import { z } from 'zod'
import { AppApiError } from '../../utils/api-error'
import { c1RequestContext } from '../c1-master-data/context'
import { createSupabaseCostSourceReadRepository } from './source-read.repository'
import { createCostSourceReadService } from './source-read.service'

const uuid = z.string().uuid()
function param(event: H3Event, name: string) { const value = uuid.safeParse(getRouterParam(event, name)); if (!value.success) throw new AppApiError(400, 'INPUT_INVALID', 'Định danh không hợp lệ.'); return value.data }
export function createSupabaseCostSourceReadRoutes(event: H3Event) {
  async function service() { const companyId = param(event, 'companyId'); const context = await c1RequestContext(event, companyId); return { context, service: createCostSourceReadService(createSupabaseCostSourceReadRepository(context.db)) } }
  return { async overview() { const value = await service(); return value.service.overview(value.context) }, async project() { const value = await service(); return value.service.project(value.context, param(event, 'projectId')) }, async figures() { const value = await service(); return value.service.figures(value.context, { ...(getQuery(event) as Record<string, string | undefined>), projectId: getRouterParam(event, 'projectId') }) }, async provenance() { const value = await service(); return value.service.provenance(value.context, param(event, 'figureId')) } }
}
