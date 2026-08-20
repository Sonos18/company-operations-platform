import type { H3Event } from 'h3'
import { getQuery, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import {
  roleAssignmentInputSchema,
  roleAssignmentListQuerySchema,
  roleAssignmentRevokeInputSchema,
} from '../../../shared/schemas/rbac'
import { AppApiError } from '../../utils/api-error'
import { createSupabaseAuthorizationReader } from '../authorization/authorization.service'
import { createSupabaseTenancyReader, createTenancyService } from '../tenancy/tenancy.service'
import { requireAuthenticatedRequest } from '../../utils/auth-context'
import { createSupabaseRoleLifecycleRepository } from './rbac.repository'
import {
  createRoleLifecycleService,
  type RoleLifecycleServiceContext,
} from './rbac.service'

const companyIdSchema = z.string().uuid()
const assignmentIdSchema = z.coerce.number().int().positive()

export interface RoleLifecycleRouteService {
  list(context: RoleLifecycleServiceContext): Promise<unknown>
  authorizeListAssignments(context: RoleLifecycleServiceContext): Promise<void>
  listAssignments(context: RoleLifecycleServiceContext, query: z.infer<typeof roleAssignmentListQuerySchema>): Promise<unknown>
  authorizeGrant(context: RoleLifecycleServiceContext): Promise<void>
  authorizeRevoke(context: RoleLifecycleServiceContext): Promise<void>
  grant(
    context: RoleLifecycleServiceContext,
    input: z.infer<typeof roleAssignmentInputSchema>,
  ): Promise<unknown>
  revoke(
    context: RoleLifecycleServiceContext,
    assignmentId: number,
    input: z.infer<typeof roleAssignmentRevokeInputSchema>,
  ): Promise<unknown>
}

export interface RoleLifecycleRouteDependencies {
  resolveContext(event: unknown, companyId: string): Promise<RoleLifecycleServiceContext>
  service: RoleLifecycleRouteService
}

function companyIdFrom(event: unknown): string {
  const parsed = companyIdSchema.safeParse(getRouterParam(event as never, 'companyId'))
  if (!parsed.success) {
    throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Bạn cần chọn công ty để tiếp tục.')
  }
  return parsed.data
}

function assignmentIdFrom(event: unknown): number {
  const parsed = assignmentIdSchema.safeParse(getRouterParam(event as never, 'assignmentId'))
  if (!parsed.success) {
    throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Dữ liệu yêu cầu không hợp lệ.')
  }
  return parsed.data
}

function parse<T>(result: { success: true, data: T } | { success: false }): T {
  if (!result.success) {
    throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Dữ liệu yêu cầu không hợp lệ.')
  }
  return result.data
}

export function createRoleLifecycleRoutes(dependencies: RoleLifecycleRouteDependencies) {
  return {
    async list(event: unknown) {
      const companyId = companyIdFrom(event)
      const context = await dependencies.resolveContext(event, companyId)
      return dependencies.service.list(context)
    },
    async listAssignments(event: unknown) {
      const companyId = companyIdFrom(event)
      const context = await dependencies.resolveContext(event, companyId)
      await dependencies.service.authorizeListAssignments(context)
      const query = parse(roleAssignmentListQuerySchema.safeParse(getQuery(event as never)))
      return dependencies.service.listAssignments(context, query)
    },
    async grant(event: unknown) {
      const companyId = companyIdFrom(event)
      const context = await dependencies.resolveContext(event, companyId)
      await dependencies.service.authorizeGrant(context)
      const input = parse(roleAssignmentInputSchema.safeParse(await readBody(event as never)))
      return dependencies.service.grant(context, input)
    },
    async revoke(event: unknown) {
      const companyId = companyIdFrom(event)
      const assignmentId = assignmentIdFrom(event)
      const context = await dependencies.resolveContext(event, companyId)
      await dependencies.service.authorizeRevoke(context)
      const input = parse(roleAssignmentRevokeInputSchema.safeParse(await readBody(event as never)))
      return dependencies.service.revoke(context, assignmentId, input)
    },
  }
}

export function createSupabaseRoleLifecycleRoutes(event: H3Event) {
  let service: ReturnType<typeof createRoleLifecycleService> | undefined

  async function resolveContext(_event: unknown, companyId: string): Promise<RoleLifecycleServiceContext> {
    const { actor, db } = await requireAuthenticatedRequest(event)
    const tenancy = createTenancyService(
      createSupabaseTenancyReader(db),
      createSupabaseAuthorizationReader(db),
    )
    const context = await tenancy.resolveCompanyContext(actor.userId, companyId)
    service = createRoleLifecycleService(createSupabaseRoleLifecycleRepository(db))
    return { actorId: actor.userId, ...context }
  }

  function resolvedService() {
    if (!service) {
      throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể khởi tạo dịch vụ vai trò.')
    }
    return service
  }

  return createRoleLifecycleRoutes({
    resolveContext,
    service: {
      list: context => resolvedService().list(context),
      authorizeListAssignments: context => resolvedService().authorizeListAssignments(context),
      listAssignments: (context, query) => resolvedService().listAssignments(context, query),
      authorizeGrant: context => resolvedService().authorizeGrant(context),
      authorizeRevoke: context => resolvedService().authorizeRevoke(context),
      grant: (context, input) => resolvedService().grant(context, input),
      revoke: (context, assignmentId, input) => resolvedService().revoke(context, assignmentId, input),
    },
  })
}
