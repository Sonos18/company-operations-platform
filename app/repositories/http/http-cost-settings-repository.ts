import { companyCostSettingsSchema, type CompanyCostSettings } from '../../../shared/schemas/costs/master-data'
import type { AuthenticatedHttpClient } from './authenticated-http-client'
export interface HttpCostSettingsRepository { get(): Promise<CompanyCostSettings> }
export function createHttpCostSettingsRepository(options: { companyId: string | (() => string); client: AuthenticatedHttpClient }): HttpCostSettingsRepository { return { get: () => options.client.request({ url: `/api/companies/${encodeURIComponent(typeof options.companyId === 'function' ? options.companyId() : options.companyId)}/cost-settings`, method: 'GET', schema: companyCostSettingsSchema }) } }
