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
export interface ControlledImportRouteDependencies {
  resolveContext(event: H3Event, companyId: string): ReturnType<typeof c1RequestContext>
}
export function createControlledImportRoutes(dependencies: ControlledImportRouteDependencies) {
  async function resolved(event: H3Event) {
    const companyId = routeUuid(event, 'companyId')
    const context = await dependencies.resolveContext(event, companyId)
    return { companyId, context, service: createControlledImportService(createSupabaseControlledImportRepository(context.db), VQH_ADAPTER) }
  }
  return {
    async persist(event: H3Event) { const value = await resolved(event); return value.service.persist(value.context, await readBody(event)) },
    async get(event: H3Event) { const value = await resolved(event); return value.service.get(value.context, routeUuid(event, 'runId')) },
  }
}
export function createSupabaseControlledImportRoutes(event: H3Event) {
  const routes = createControlledImportRoutes({ resolveContext: c1RequestContext })
  return { persist: () => routes.persist(event), get: () => routes.get(event) }
}
