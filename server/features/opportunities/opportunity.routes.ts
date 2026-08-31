import type { H3Event } from 'h3'
import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import {
  addContactMethodInputSchema,
  addOpportunityReferrerInputSchema,
  addOpportunityScopeInputSchema,
  appendIntakeRecordInputSchema,
  correctIntakeRecordInputSchema,
  createContactInputSchema,
  createOpportunityInputSchema,
  endOpportunityContactInputSchema,
  endOpportunityReferrerInputSchema,
  invalidateOpportunityInputSchema,
  linkOpportunityContactInputSchema,
  raiseDuplicateConcernInputSchema,
  resolveDuplicateConcernInputSchema,
  restoreOpportunityInputSchema,
  retireOpportunityScopeInputSchema,
  setPrimaryContactInputSchema,
  setPrimaryReferrerInputSchema,
  updateContactInputSchema,
  updateContactMethodInputSchema,
  updateOpportunityInputSchema,
} from '../../../shared/schemas/opportunities'
import { AppApiError } from '../../utils/api-error'
import { requireAuthenticatedRequest } from '../../utils/auth-context'
import { createSupabaseAuthorizationReader } from '../authorization/authorization.service'
import { createSupabaseTenancyReader, createTenancyService } from '../tenancy/tenancy.service'
import type { Stage01ServiceContext } from '../stage01/stage01.service'
import { createSupabaseOpportunityRepository } from './opportunity.repository'
import { createOpportunityService } from './opportunity.service'

const uuidSchema = z.string().uuid()

export interface OpportunityRouteDependencies {
  resolveContext(event: unknown, companyId: string): Promise<Stage01ServiceContext>
  service: ReturnType<typeof createOpportunityService>
}

function routeId(event: unknown, name: string): string {
  const result = uuidSchema.safeParse(getRouterParam(event as never, name))
  if (!result.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Dữ liệu yêu cầu không hợp lệ.')
  return result.data
}
function body<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Dữ liệu yêu cầu không hợp lệ.')
  return result.data
}

export function createOpportunityRoutes(dependencies: OpportunityRouteDependencies) {
  async function scoped(event: unknown) {
    const companyId = routeId(event, 'companyId')
    return { context: await dependencies.resolveContext(event, companyId) }
  }
  return {
    async list(event: unknown) {
      const { context } = await scoped(event)
      return dependencies.service.list(context)
    },
    async getCreateOptions(event: unknown) {
      const { context } = await scoped(event)
      return dependencies.service.getCreateOptions(context)
    },
    async get(event: unknown) {
      const { context } = await scoped(event)
      return dependencies.service.get(context, routeId(event, 'opportunityId'))
    },
    async create(event: unknown) {
      const { context } = await scoped(event)
      return dependencies.service.create(context, body(createOpportunityInputSchema, await readBody(event as never)))
    },
    async update(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      return dependencies.service.update(context, opportunityId, body(updateOpportunityInputSchema, await readBody(event as never)))
    },
    async createContact(event: unknown) {
      const { context } = await scoped(event)
      return dependencies.service.createContact(context, body(createContactInputSchema, await readBody(event as never)))
    },
    async updateContact(event: unknown) {
      const { context } = await scoped(event)
      const contactId = routeId(event, 'contactId')
      return dependencies.service.updateContact(context, contactId, body(updateContactInputSchema, await readBody(event as never)))
    },
    async addContactMethod(event: unknown) {
      const { context } = await scoped(event)
      const contactId = routeId(event, 'contactId')
      return dependencies.service.addContactMethod(context, contactId, body(addContactMethodInputSchema, await readBody(event as never)))
    },
    async updateContactMethod(event: unknown) {
      const { context } = await scoped(event)
      const contactId = routeId(event, 'contactId')
      const methodId = routeId(event, 'methodId')
      return dependencies.service.updateContactMethod(context, contactId, methodId, body(updateContactMethodInputSchema, await readBody(event as never)))
    },
    async linkContact(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      return dependencies.service.linkContact(context, opportunityId, body(linkOpportunityContactInputSchema, await readBody(event as never)))
    },
    async setPrimaryContact(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      return dependencies.service.setPrimaryContact(context, opportunityId, body(setPrimaryContactInputSchema, await readBody(event as never)))
    },
    async endContact(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      const relationshipId = routeId(event, 'opportunityContactId')
      await dependencies.service.endContact(context, opportunityId, relationshipId, body(endOpportunityContactInputSchema, await readBody(event as never)))
      return null
    },
    async addScope(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      return dependencies.service.addScope(context, opportunityId, body(addOpportunityScopeInputSchema, await readBody(event as never)))
    },
    async retireScope(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      const scopeId = routeId(event, 'scopeId')
      await dependencies.service.retireScope(context, opportunityId, scopeId, body(retireOpportunityScopeInputSchema, await readBody(event as never)))
      return null
    },
    async addReferrer(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      return dependencies.service.addReferrer(context, opportunityId, body(addOpportunityReferrerInputSchema, await readBody(event as never)))
    },
    async setPrimaryReferrer(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      return dependencies.service.setPrimaryReferrer(context, opportunityId, body(setPrimaryReferrerInputSchema, await readBody(event as never)))
    },
    async endReferrer(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      const referrerId = routeId(event, 'referrerId')
      await dependencies.service.endReferrer(context, opportunityId, referrerId, body(endOpportunityReferrerInputSchema, await readBody(event as never)))
      return null
    },
    async addIntakeRecord(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      return dependencies.service.addIntakeRecord(context, opportunityId, body(appendIntakeRecordInputSchema, await readBody(event as never)))
    },
    async correctIntakeRecord(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      const recordId = routeId(event, 'recordId')
      return dependencies.service.correctIntakeRecord(context, opportunityId, recordId, body(correctIntakeRecordInputSchema, await readBody(event as never)))
    },
    async raiseDuplicateConcern(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      return dependencies.service.raiseDuplicateConcern(context, opportunityId, body(raiseDuplicateConcernInputSchema, await readBody(event as never)))
    },
    async resolveDuplicateConcern(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      const concernId = routeId(event, 'concernId')
      await dependencies.service.resolveDuplicateConcern(context, opportunityId, concernId, body(resolveDuplicateConcernInputSchema, await readBody(event as never)))
      return null
    },
    async invalidate(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      await dependencies.service.invalidate(context, opportunityId, body(invalidateOpportunityInputSchema, await readBody(event as never)))
      return null
    },
    async restore(event: unknown) {
      const { context } = await scoped(event)
      const opportunityId = routeId(event, 'opportunityId')
      await dependencies.service.restore(context, opportunityId, body(restoreOpportunityInputSchema, await readBody(event as never)))
      return null
    },
  }
}

export function createSupabaseOpportunityRoutes(event: H3Event) {
  let service: ReturnType<typeof createOpportunityService> | undefined
  async function resolveContext(_event: unknown, companyId: string): Promise<Stage01ServiceContext> {
    const { actor, db } = await requireAuthenticatedRequest(event)
    const tenancy = createTenancyService(createSupabaseTenancyReader(db), createSupabaseAuthorizationReader(db))
    const company = await tenancy.resolveCompanyContext(actor.userId, companyId)
    service = createOpportunityService(createSupabaseOpportunityRepository(db))
    return { actorId: actor.userId, ...company, requestId: event.context.requestId }
  }
  const resolved = () => service ?? (() => { throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể khởi tạo Opportunity service.') })()
  return createOpportunityRoutes({
    resolveContext,
    service: new Proxy({} as ReturnType<typeof createOpportunityService>, {
      get: (_target, property) => (...args: unknown[]) => Reflect.apply(Reflect.get(resolved(), property), resolved(), args),
    }),
  })
}
