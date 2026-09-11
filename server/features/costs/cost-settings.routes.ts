import type { H3Event } from 'h3'
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { AppApiError } from '../../utils/api-error'
import { c1RequestContext } from '../c1-master-data/context'
import { createSupabaseCostSettingsRepository } from './cost-settings.repository'
import { createCostSettingsService } from './cost-settings.service'
export function createSupabaseCostSettingsRoutes(event: H3Event) { return { async get() { const companyId = z.string().uuid().safeParse(getRouterParam(event, 'companyId')); if (!companyId.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Định danh không hợp lệ.'); const context = await c1RequestContext(event, companyId.data); return createCostSettingsService(createSupabaseCostSettingsRepository(context.db)).get(context) } } }
