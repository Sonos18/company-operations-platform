import type { H3Event } from 'h3'
import { getQuery, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import {
  employeeListQuerySchema,
  employeeUpdateInputSchema,
} from '../../../shared/schemas/employees'
import { AppApiError } from '../../utils/api-error'
import { createSupabaseAuthorizationReader } from '../authorization/authorization.service'
import { createSupabaseTenancyReader, createTenancyService } from '../tenancy/tenancy.service'
import { requireAuthenticatedRequest } from '../../utils/auth-context'
import { createSupabaseEmployeeRepository } from './employee.repository'
import { createEmployeeService } from './employee.service'
import type { EmployeeServiceContext } from './employee.service'

const uuidSchema = z.string().uuid()

export interface EmployeeRouteService {
  list(context: EmployeeServiceContext, query: z.infer<typeof employeeListQuerySchema>): Promise<unknown>
  detail(context: EmployeeServiceContext, employeeId: string): Promise<unknown>
  update(
    context: EmployeeServiceContext,
    employeeId: string,
    input: z.infer<typeof employeeUpdateInputSchema>,
  ): Promise<unknown>
}

export interface EmployeeRouteDependencies {
  resolveContext(event: unknown, companyId: string): Promise<EmployeeServiceContext>
  service: EmployeeRouteService
}

function companyIdFrom(event: unknown): string {
  const result = uuidSchema.safeParse(getRouterParam(event as never, 'companyId'))
  if (!result.success) {
    throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Bạn cần chọn công ty để tiếp tục.')
  }
  return result.data
}

function employeeIdFrom(event: unknown): string {
  const result = uuidSchema.safeParse(getRouterParam(event as never, 'employeeId'))
  if (!result.success) {
    throw new AppApiError(400, 'EMPLOYEE_NOT_FOUND', 'Không tìm thấy nhân viên.')
  }
  return result.data
}

function parse<T>(result: { success: true, data: T } | { success: false }): T {
  if (!result.success) {
    throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Dữ liệu yêu cầu không hợp lệ.')
  }
  return result.data
}

export function createEmployeeRoutes(dependencies: EmployeeRouteDependencies) {
  return {
    async list(event: unknown) {
      const query = parse(employeeListQuerySchema.safeParse(getQuery(event as never)))
      const companyId = companyIdFrom(event)
      const context = await dependencies.resolveContext(event, companyId)
      return dependencies.service.list(context, query)
    },
    async detail(event: unknown) {
      const companyId = companyIdFrom(event)
      const employeeId = employeeIdFrom(event)
      const context = await dependencies.resolveContext(event, companyId)
      return dependencies.service.detail(context, employeeId)
    },
    async update(event: unknown) {
      const input = parse(employeeUpdateInputSchema.safeParse(await readBody(event as never)))
      const companyId = companyIdFrom(event)
      const employeeId = employeeIdFrom(event)
      const context = await dependencies.resolveContext(event, companyId)
      return dependencies.service.update(context, employeeId, input)
    },
  }
}

export function createSupabaseEmployeeRoutes(event: H3Event) {
  let service: ReturnType<typeof createEmployeeService> | undefined

  async function resolveContext(_event: unknown, companyId: string): Promise<EmployeeServiceContext> {
    const { actor, db } = await requireAuthenticatedRequest(event)
    service = createEmployeeService(createSupabaseEmployeeRepository(db))
    const tenancy = createTenancyService(
      createSupabaseTenancyReader(db),
      createSupabaseAuthorizationReader(db),
    )
    const context = await tenancy.resolveCompanyContext(actor.userId, companyId)
    return { actorId: actor.userId, ...context }
  }

  function resolvedService() {
    if (!service) {
      throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể khởi tạo dịch vụ nhân viên.')
    }
    return service
  }

  return createEmployeeRoutes({
    resolveContext,
    service: {
      list: (...args) => resolvedService().list(...args),
      detail: (...args) => resolvedService().detail(...args),
      update: (...args) => resolvedService().update(...args),
    },
  })
}
