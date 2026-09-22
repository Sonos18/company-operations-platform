import type { H3Event } from 'h3'
import { getHeader, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { costEvidenceCreateIntentInputSchema, costEvidenceFinalizeInputSchema, costEvidenceLinkInputSchema, costEvidenceReadUrlInputSchema } from '../../../../shared/schemas/costs/cost-evidence'
import { AppApiError } from '../../../utils/api-error'
import { c1RequestContext } from '../../c1-master-data/context'
import { CostEvidenceRepository } from './cost-evidence.repository'
import { CostEvidenceService } from './cost-evidence.service'

const uuid = z.string().uuid()
export interface CostEvidenceRouteDependencies { resolveContext(event: H3Event, companyId: string): ReturnType<typeof c1RequestContext>; service?: CostEvidenceService }
function invalid(): never { throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.') }
function param(event: H3Event, name: string) { const value = uuid.safeParse(getRouterParam(event, name)); return value.success ? value.data : invalid() }
async function body<T>(event: H3Event, schema: z.ZodType<T>) { const value = schema.safeParse(await readBody(event)); return value.success ? value.data : invalid() }
function key(event: H3Event) { const value = uuid.safeParse(getHeader(event, 'idempotency-key')); return value.success ? value.data : invalid() }

export function createCostEvidenceRoutes(dependencies: CostEvidenceRouteDependencies) {
  async function resolved(event: H3Event) { const context = await dependencies.resolveContext(event, param(event, 'companyId')); return { context, service: dependencies.service ?? new CostEvidenceService(new CostEvidenceRepository(context.db)) } }
  return {
    async createIntent(event: H3Event) { const value = await resolved(event); return value.service.createIntent(value.context, param(event, 'projectId'), await body(event, costEvidenceCreateIntentInputSchema), key(event)) },
    async finalize(event: H3Event) { const value = await resolved(event); return value.service.finalize(value.context, param(event, 'evidenceFileId'), await body(event, costEvidenceFinalizeInputSchema), key(event)) },
    async linkCost(event: H3Event) { const value = await resolved(event); return value.service.linkCost(value.context, param(event, 'projectCostItemId'), await body(event, costEvidenceLinkInputSchema), key(event)) },
    async listCostEvidence(event: H3Event) { const value = await resolved(event); return value.service.listCostEvidence(value.context, param(event, 'projectCostItemId')) },
    async createReadUrl(event: H3Event) { const value = await resolved(event); return value.service.createReadUrl(value.context, param(event, 'evidenceFileId'), await body(event, costEvidenceReadUrlInputSchema)) },
  }
}

export function createSupabaseCostEvidenceRoutes(event: H3Event) { return createCostEvidenceRoutes({ resolveContext: c1RequestContext }) }
