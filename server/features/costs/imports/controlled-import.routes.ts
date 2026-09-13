import type { H3Event } from 'h3'
import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { AppApiError } from '../../../utils/api-error'
import { c1RequestContext } from '../../c1-master-data/context'
import { createSupabaseControlledImportRepository } from './controlled-import.repository'
import { createControlledImportService } from './controlled-import.service'
import { VQH_ADAPTER } from './vqh-workbook-family-adapter'

function routeUuid(event: H3Event, name: string) {
  const parsed = z.string().uuid().safeParse(getRouterParam(event, name))
  if (!parsed.success) throw new AppApiError(400, 'INPUT_INVALID', 'Định danh import không hợp lệ.')
  return parsed.data
}
export function createSupabaseControlledImportRoutes(event: H3Event) {
  async function resolved() {
    const companyId = routeUuid(event, 'companyId')
    const context = await c1RequestContext(event, companyId)
    return { companyId, context, service: createControlledImportService(createSupabaseControlledImportRepository(context.db), VQH_ADAPTER) }
  }
  return {
    async persist() { const value = await resolved(); return value.service.persist(value.context, await readBody(event)) },
    async get() { const value = await resolved(); return value.service.get(value.context, routeUuid(event, 'runId')) },
  }
}
