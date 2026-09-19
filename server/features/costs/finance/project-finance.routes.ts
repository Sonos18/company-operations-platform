import type { H3Event } from 'h3'
import { getQuery, getRouterParam } from 'h3'
import { z } from 'zod'
import { itemDetailQuerySchema, paymentQuerySchema, projectDirectoryQuerySchema, financeListQuerySchema, type ItemDetailQuery, type PaymentQuery, type ProjectDirectoryQuery, type FinanceListQuery } from '../../../../shared/schemas/costs/project-finance'
import { AppApiError } from '../../../utils/api-error'
import { c1RequestContext } from '../../c1-master-data/context'
import { createSupabaseProjectFinanceRepository } from './project-finance.repository'
import { ProjectFinanceService, type ProjectFinanceServiceContext } from './project-finance.service'

const uuid = z.string().uuid()
type ResolveContext = (event: H3Event, companyId: string) => Promise<ProjectFinanceServiceContext>

export interface ProjectFinanceRouteDependencies {
  resolveContext(event: H3Event, companyId: string): ReturnType<ResolveContext>
  service?: ProjectFinanceService
}

function param(event: H3Event, name: string): string {
  const parsed = uuid.safeParse(getRouterParam(event, name))
  if (!parsed.success) throw new AppApiError(400, 'INPUT_INVALID', 'Định danh không hợp lệ.')
  return parsed.data
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
  return parsed.data
}

function query(event: H3Event) { return getQuery(event) as Record<string, unknown> }

export function createProjectFinanceRoutes(dependencies: ProjectFinanceRouteDependencies) {
  async function resolved(event: H3Event) {
    const context = await dependencies.resolveContext(event, param(event, 'companyId'))
    const service = dependencies.service ?? (() => {
      if (!context.db) throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể khởi tạo dịch vụ tài chính.')
      return new ProjectFinanceService(createSupabaseProjectFinanceRepository(context.db))
    })()
    return { context, service }
  }
  return {
    async listProjects(event: H3Event) {
      const value = await resolved(event)
      return value.service.listProjects(value.context, parse<ProjectDirectoryQuery>(projectDirectoryQuerySchema, query(event)))
    },
    async overview(event: H3Event) {
      const value = await resolved(event)
      return value.service.overview(value.context, param(event, 'projectId'))
    },
    async budget(event: H3Event) {
      const value = await resolved(event)
      return value.service.budget(value.context, param(event, 'projectId'))
    },
    async ownerAdvances(event: H3Event) {
      const value = await resolved(event)
      return value.service.ownerAdvances(value.context, param(event, 'projectId'), parse<FinanceListQuery>(financeListQuerySchema, query(event)))
    },
    async subcontractors(event: H3Event) {
      const value = await resolved(event)
      return value.service.subcontractors(value.context, param(event, 'projectId'))
    },
    async subcontractor(event: H3Event) {
      const value = await resolved(event)
      return value.service.subcontractor(value.context, param(event, 'projectId'), param(event, 'partyId'), parse<PaymentQuery>(paymentQuerySchema, query(event)))
    },
    async subcontract(event: H3Event) {
      const value = await resolved(event)
      return value.service.subcontract(value.context, param(event, 'projectId'), param(event, 'subcontractId'), parse<PaymentQuery>(paymentQuerySchema, query(event)))
    },
    async itemDetails(event: H3Event) {
      const value = await resolved(event)
      return value.service.itemDetails(value.context, param(event, 'projectId'), param(event, 'projectCostItemId'), parse<ItemDetailQuery>(itemDetailQuerySchema, query(event)))
    },
  }
}

export function createSupabaseProjectFinanceRoutes(event: H3Event) {
  const routes = createProjectFinanceRoutes({ resolveContext: c1RequestContext })
  return {
    listProjects: () => routes.listProjects(event),
    overview: () => routes.overview(event),
    budget: () => routes.budget(event),
    ownerAdvances: () => routes.ownerAdvances(event),
    subcontractors: () => routes.subcontractors(event),
    subcontractor: () => routes.subcontractor(event),
    subcontract: () => routes.subcontract(event),
    itemDetails: () => routes.itemDetails(event),
  }
}
