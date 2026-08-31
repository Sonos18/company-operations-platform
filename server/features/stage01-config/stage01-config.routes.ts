import type { H3Event } from 'h3'
import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import {
  createStage01ConfigDraftInputSchema,
  discardStage01ConfigDraftInputSchema,
  publishStage01ConfigDraftInputSchema,
  updateStage01ConfigDraftInputSchema,
} from '../../../shared/schemas/stage01-config'
import { AppApiError } from '../../utils/api-error'
import { requireAuthenticatedRequest } from '../../utils/auth-context'
import { createSupabaseAuthorizationReader } from '../authorization/authorization.service'
import type { Stage01ServiceContext } from '../stage01/stage01.service'
import { createSupabaseTenancyReader, createTenancyService } from '../tenancy/tenancy.service'
import { createSupabaseStage01ConfigRepository } from './stage01-config.repository'
import { createStage01ConfigService } from './stage01-config.service'

const uuidSchema = z.string().uuid()

export interface Stage01ConfigRouteDependencies {
  resolveContext(event: unknown, companyId: string): Promise<Stage01ServiceContext>
  service: ReturnType<typeof createStage01ConfigService>
}

function companyIdFrom(event: unknown): string {
  const result = uuidSchema.safeParse(getRouterParam(event as never, 'companyId'))
  if (!result.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Dữ liệu yêu cầu không hợp lệ.')
  return result.data
}
function body<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Dữ liệu yêu cầu không hợp lệ.')
  return result.data
}

export function createStage01ConfigRoutes(dependencies: Stage01ConfigRouteDependencies) {
  async function scoped(event: unknown) {
    return dependencies.resolveContext(event, companyIdFrom(event))
  }
  return {
    async get(event: unknown) {
      return dependencies.service.get(await scoped(event))
    },
    async createDraft(event: unknown) {
      return dependencies.service.createDraft(await scoped(event), body(createStage01ConfigDraftInputSchema, await readBody(event as never)))
    },
    async updateDraft(event: unknown) {
      return dependencies.service.updateDraft(await scoped(event), body(updateStage01ConfigDraftInputSchema, await readBody(event as never)))
    },
    async discardDraft(event: unknown) {
      return dependencies.service.discardDraft(await scoped(event), body(discardStage01ConfigDraftInputSchema, await readBody(event as never)))
    },
    async publishDraft(event: unknown) {
      return dependencies.service.publishDraft(await scoped(event), body(publishStage01ConfigDraftInputSchema, await readBody(event as never)))
    },
  }
}

export function createSupabaseStage01ConfigRoutes(event: H3Event) {
  let service: ReturnType<typeof createStage01ConfigService> | undefined
  async function resolveContext(_event: unknown, companyId: string): Promise<Stage01ServiceContext> {
    const { actor, db } = await requireAuthenticatedRequest(event)
    const tenancy = createTenancyService(createSupabaseTenancyReader(db), createSupabaseAuthorizationReader(db))
    const company = await tenancy.resolveCompanyContext(actor.userId, companyId)
    service = createStage01ConfigService(createSupabaseStage01ConfigRepository(db))
    return { actorId: actor.userId, ...company, requestId: event.context.requestId }
  }
  function resolved() {
    if (!service) throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể khởi tạo Stage 01 configuration service.')
    return service
  }
  return createStage01ConfigRoutes({
    resolveContext,
    service: {
      get: (...args) => resolved().get(...args),
      createDraft: (...args) => resolved().createDraft(...args),
      updateDraft: (...args) => resolved().updateDraft(...args),
      discardDraft: (...args) => resolved().discardDraft(...args),
      publishDraft: (...args) => resolved().publishDraft(...args),
    },
  })
}
