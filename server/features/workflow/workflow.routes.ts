import type { H3Event } from 'h3'
import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import {
  assignWorkflowNodeInputSchema,
  completeWorkflowNodeInputSchema,
  endWorkflowAssignmentInputSchema,
  raiseWorkflowBlockerInputSchema,
  reopenWorkflowNodeInputSchema,
  resolveWorkflowBlockerInputSchema,
  revalidateWorkflowNodeInputSchema,
  startWorkflowNodeInputSchema,
} from '../../../shared/schemas/workflow'
import { AppApiError } from '../../utils/api-error'
import { requireAuthenticatedRequest } from '../../utils/auth-context'
import { createSupabaseAuthorizationReader } from '../authorization/authorization.service'
import type { Stage01ServiceContext } from '../stage01/stage01.service'
import { createSupabaseTenancyReader, createTenancyService } from '../tenancy/tenancy.service'
import { createSupabaseWorkflowRepository } from './workflow.repository'
import { createWorkflowService } from './workflow.service'

const uuidSchema = z.string().uuid()

export interface WorkflowRouteDependencies {
  resolveContext(event: unknown, companyId: string): Promise<Stage01ServiceContext>
  service: ReturnType<typeof createWorkflowService>
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

export function createWorkflowRoutes(dependencies: WorkflowRouteDependencies) {
  async function scoped(event: unknown) {
    const companyId = routeId(event, 'companyId')
    return dependencies.resolveContext(event, companyId)
  }
  return {
    async getForOpportunity(event: unknown) {
      const context = await scoped(event)
      return dependencies.service.getForOpportunity(context, routeId(event, 'opportunityId'))
    },
    async startNode(event: unknown) {
      const context = await scoped(event)
      return dependencies.service.startNode(context, routeId(event, 'nodeExecutionId'), body(startWorkflowNodeInputSchema, await readBody(event as never)))
    },
    async completeNode(event: unknown) {
      const context = await scoped(event)
      return dependencies.service.completeNode(context, routeId(event, 'nodeExecutionId'), body(completeWorkflowNodeInputSchema, await readBody(event as never)))
    },
    async reopenNode(event: unknown) {
      const context = await scoped(event)
      return dependencies.service.reopenNode(context, routeId(event, 'nodeExecutionId'), body(reopenWorkflowNodeInputSchema, await readBody(event as never)))
    },
    async revalidateNode(event: unknown) {
      const context = await scoped(event)
      return dependencies.service.revalidateNode(context, routeId(event, 'nodeExecutionId'), body(revalidateWorkflowNodeInputSchema, await readBody(event as never)))
    },
    async assign(event: unknown) {
      const context = await scoped(event)
      await dependencies.service.assign(context, routeId(event, 'nodeExecutionId'), body(assignWorkflowNodeInputSchema, await readBody(event as never)))
      return null
    },
    async endAssignment(event: unknown) {
      const context = await scoped(event)
      await dependencies.service.endAssignment(context, routeId(event, 'assignmentId'), body(endWorkflowAssignmentInputSchema, await readBody(event as never)))
      return null
    },
    async raiseBlocker(event: unknown) {
      const context = await scoped(event)
      await dependencies.service.raiseBlocker(context, routeId(event, 'nodeExecutionId'), body(raiseWorkflowBlockerInputSchema, await readBody(event as never)))
      return null
    },
    async resolveBlocker(event: unknown) {
      const context = await scoped(event)
      await dependencies.service.resolveBlocker(context, routeId(event, 'blockerId'), body(resolveWorkflowBlockerInputSchema, await readBody(event as never)))
      return null
    },
  }
}

export function createSupabaseWorkflowRoutes(event: H3Event) {
  let service: ReturnType<typeof createWorkflowService> | undefined
  async function resolveContext(_event: unknown, companyId: string): Promise<Stage01ServiceContext> {
    const { actor, db } = await requireAuthenticatedRequest(event)
    const tenancy = createTenancyService(createSupabaseTenancyReader(db), createSupabaseAuthorizationReader(db))
    const company = await tenancy.resolveCompanyContext(actor.userId, companyId)
    service = createWorkflowService(createSupabaseWorkflowRepository(db))
    return { actorId: actor.userId, ...company, requestId: event.context.requestId }
  }
  function resolved() {
    if (!service) throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể khởi tạo Workflow service.')
    return service
  }
  return createWorkflowRoutes({
    resolveContext,
    service: {
      getForOpportunity: (...args) => resolved().getForOpportunity(...args),
      startNode: (...args) => resolved().startNode(...args),
      completeNode: (...args) => resolved().completeNode(...args),
      reopenNode: (...args) => resolved().reopenNode(...args),
      revalidateNode: (...args) => resolved().revalidateNode(...args),
      assign: (...args) => resolved().assign(...args),
      endAssignment: (...args) => resolved().endAssignment(...args),
      raiseBlocker: (...args) => resolved().raiseBlocker(...args),
      resolveBlocker: (...args) => resolved().resolveBlocker(...args),
    },
  })
}
