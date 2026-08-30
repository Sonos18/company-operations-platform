import type { H3Event } from 'h3'
import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import {
  criterionEvaluationRevisionInputSchema,
  reactivateStage01InputSchema,
  recordFinalDecisionInputSchema,
  returnForClarificationInputSchema,
  submitRecommendationInputSchema,
} from '../../../shared/schemas/stage01'
import { AppApiError } from '../../utils/api-error'
import { requireAuthenticatedRequest } from '../../utils/auth-context'
import { createSupabaseAuthorizationReader } from '../authorization/authorization.service'
import { createSupabaseTenancyReader, createTenancyService } from '../tenancy/tenancy.service'
import { createSupabaseStage01Repository } from './stage01.repository'
import { createStage01Service } from './stage01.service'
import type { Stage01ServiceContext } from './stage01.service'

const uuidSchema = z.string().uuid()
const criterionKeySchema = z.string().trim().min(1).max(200)

export interface Stage01RouteDependencies {
  resolveContext(event: unknown, companyId: string): Promise<Stage01ServiceContext>
  service: ReturnType<typeof createStage01Service>
}

function routeId(event: unknown, name: string): string {
  const result = uuidSchema.safeParse(getRouterParam(event as never, name))
  if (!result.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Dữ liệu yêu cầu không hợp lệ.')
  return result.data
}
function criterionKeyFrom(event: unknown): string {
  const result = criterionKeySchema.safeParse(getRouterParam(event as never, 'criterionKey'))
  if (!result.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Dữ liệu yêu cầu không hợp lệ.')
  return result.data
}
function body<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Dữ liệu yêu cầu không hợp lệ.')
  return result.data
}

export function createStage01Routes(dependencies: Stage01RouteDependencies) {
  async function scoped(event: unknown) {
    const companyId = routeId(event, 'companyId')
    return dependencies.resolveContext(event, companyId)
  }
  return {
    async get(event: unknown) {
      const context = await scoped(event)
      return dependencies.service.get(context, routeId(event, 'opportunityId'))
    },
    async evaluateCriterion(event: unknown) {
      const context = await scoped(event)
      await dependencies.service.evaluateCriterion(context, routeId(event, 'opportunityId'), criterionKeyFrom(event),
        body(criterionEvaluationRevisionInputSchema, await readBody(event as never)))
      return null
    },
    async submitRecommendation(event: unknown) {
      const context = await scoped(event)
      await dependencies.service.submitRecommendation(context, routeId(event, 'opportunityId'),
        body(submitRecommendationInputSchema, await readBody(event as never)))
      return null
    },
    async returnForClarification(event: unknown) {
      const context = await scoped(event)
      await dependencies.service.returnForClarification(context, routeId(event, 'opportunityId'),
        body(returnForClarificationInputSchema, await readBody(event as never)))
      return null
    },
    async recordFinalDecision(event: unknown) {
      const context = await scoped(event)
      await dependencies.service.recordFinalDecision(context, routeId(event, 'opportunityId'),
        body(recordFinalDecisionInputSchema, await readBody(event as never)))
      return null
    },
    async reactivate(event: unknown) {
      const context = await scoped(event)
      await dependencies.service.reactivate(context, routeId(event, 'opportunityId'),
        body(reactivateStage01InputSchema, await readBody(event as never)))
      return null
    },
  }
}

export function createSupabaseStage01Routes(event: H3Event) {
  let service: ReturnType<typeof createStage01Service> | undefined
  async function resolveContext(_event: unknown, companyId: string): Promise<Stage01ServiceContext> {
    const { actor, db } = await requireAuthenticatedRequest(event)
    const tenancy = createTenancyService(createSupabaseTenancyReader(db), createSupabaseAuthorizationReader(db))
    const company = await tenancy.resolveCompanyContext(actor.userId, companyId)
    service = createStage01Service(createSupabaseStage01Repository(db))
    return { actorId: actor.userId, ...company, requestId: event.context.requestId }
  }
  function resolved() {
    if (!service) throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể khởi tạo Stage 01 service.')
    return service
  }
  return createStage01Routes({
    resolveContext,
    service: {
      get: (...args) => resolved().get(...args),
      evaluateCriterion: (...args) => resolved().evaluateCriterion(...args),
      submitRecommendation: (...args) => resolved().submitRecommendation(...args),
      returnForClarification: (...args) => resolved().returnForClarification(...args),
      recordFinalDecision: (...args) => resolved().recordFinalDecision(...args),
      reactivate: (...args) => resolved().reactivate(...args),
    },
  })
}
