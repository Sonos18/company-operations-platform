import type { H3Event } from 'h3'
import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { createBusinessPartyInputSchema, updateBusinessPartyInputSchema } from '../../../shared/schemas/costs/master-data'
import { AppApiError } from '../../utils/api-error'
import { c1RequestContext } from '../c1-master-data/context'
import { createSupabaseBusinessPartyRepository } from './business-party.repository'
import { createBusinessPartyService } from './business-party.service'
const uuid = z.string().uuid()
function param(event: H3Event, name: string) { const value = uuid.safeParse(getRouterParam(event, name)); if (!value.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Định danh không hợp lệ.'); return value.data }
async function input(event: H3Event, schema: typeof createBusinessPartyInputSchema | typeof updateBusinessPartyInputSchema) { const value = schema.safeParse(await readBody(event)); if (!value.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Dữ liệu yêu cầu không hợp lệ.'); return value.data }
export function createSupabaseBusinessPartyRoutes(event: H3Event) { async function service() { const companyId = param(event, 'companyId'); const context = await c1RequestContext(event, companyId); return { context, service: createBusinessPartyService(createSupabaseBusinessPartyRepository(context.db)) } } return { async list() { const value = await service(); return value.service.list(value.context) }, async get() { const value = await service(); return value.service.get(value.context, param(event, 'partyId')) }, async create() { const value = await service(); return value.service.create(value.context, await input(event, createBusinessPartyInputSchema) as never) }, async update() { const value = await service(); return value.service.update(value.context, param(event, 'partyId'), await input(event, updateBusinessPartyInputSchema) as never) } } }
