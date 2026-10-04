import type { H3Event } from 'h3'
import { getRouterParam, readBody, setResponseHeader } from 'h3'
import { z } from 'zod'
import { employeeInvitationInputSchema } from '../../../shared/schemas/employees'
import type { EmployeeInvitationInput } from '../../../shared/schemas/employees'
import { employeeInvitationOptionsSchema } from '../../../shared/schemas/employee-invitations'
import { AppApiError } from '../../utils/api-error'
import { requireAuthenticatedRequest } from '../../utils/auth-context'
import { createSupabaseAdminClient } from '../../utils/supabase-client'
import { parseSupabaseAdminConfig } from '../../utils/supabase-config'
import { createSupabaseTenancyReader, createTenancyService } from '../tenancy/tenancy.service'
import { createSupabaseAuthorizationReader } from '../authorization/authorization.service'
import { createSupabaseEmployeeRepository } from './employee.repository'
import type { EmployeeServiceContext } from './employee.service'
import { createManualEmployeeInvitationService, requireInvitationPermission } from './manual-invitation.service'
import { createSupabaseManualInvitationAuth } from './manual-invitation-auth'
interface Dependencies {
  resolveContext(event: H3Event, companyId: string): Promise<EmployeeServiceContext>
  prepare(context: EmployeeServiceContext, input: EmployeeInvitationInput): Promise<unknown>
  options(context: EmployeeServiceContext): Promise<unknown>
  takeSlot(context: EmployeeServiceContext): void
}
// Pilot instance-local throttle; does not promise a distributed quota.
const windows = new Map<string, { until: number; count: number }>()
export function takeManualInvitationSlot(context: EmployeeServiceContext, now = Date.now()): void {
  for (const [key, window] of windows) if (window.until <= now) windows.delete(key)
  const key = context.actorId + ':' + context.companyId
  const window = windows.get(key) ?? { until: now + 60_000, count: 0 }
  if (window.count >= 5 || (!windows.has(key) && windows.size >= 1000)) {
    throw new AppApiError(429, 'ACCOUNT_INVITE_FAILED', 'Bạn đã chuẩn bị quá nhiều lời mời. Vui lòng đợi một phút.')
  }
  window.count++
  windows.set(key, window)
}
export function createManualInvitationRoutes(dependencies: Dependencies) {
  async function context(event: H3Event) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
    const company = z.string().uuid().safeParse(getRouterParam(event, 'companyId'))
    if (!company.success) throw new AppApiError(400, 'COMPANY_CONTEXT_REQUIRED', 'Bạn cần chọn công ty.')
    const context = await dependencies.resolveContext(event, company.data)
    requireInvitationPermission(context)
    return context
  }
  return {
    async prepare(event: H3Event) {
      const scope = await context(event)
      const input = employeeInvitationInputSchema.safeParse(await readBody(event))
      if (!input.success) throw new AppApiError(400, 'INPUT_INVALID', 'Vui lòng kiểm tra thông tin nhân viên.')
      dependencies.takeSlot(scope)
      return dependencies.prepare(scope, input.data)
    },
    async options(event: H3Event) {
      return dependencies.options(await context(event))
    },
  }
}
export function createSupabaseManualInvitationRoutes(event: H3Event) {
  let userDb: Awaited<ReturnType<typeof requireAuthenticatedRequest>>['db'] | undefined
  return createManualInvitationRoutes({
    async resolveContext(_event, companyId) {
      const { actor, db } = await requireAuthenticatedRequest(event)
      userDb = db
      const tenancy = createTenancyService(createSupabaseTenancyReader(db), createSupabaseAuthorizationReader(db))
      return { actorId: actor.userId, ...await tenancy.resolveCompanyContext(actor.userId, companyId) }
    },
    async prepare(context, input) {
      if (!userDb) throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể khởi tạo lời mời.')
      const runtime = useRuntimeConfig(event)
      const config = parseSupabaseAdminConfig({ url: runtime.public.supabaseUrl, serviceRoleKey: runtime.supabaseServiceRoleKey })
      const auth = createSupabaseManualInvitationAuth(createSupabaseAdminClient(config))
      const db = userDb
      const repository = {
        ...createSupabaseEmployeeRepository(db),
        async findInvitationEmployee(companyId: string, userId: string) {
          const { data, error } = await db.from('employees').select('employee_code, work_email, full_name, department_id, position_id, hire_date, employment_status')
            .eq('company_id', companyId).eq('tenant_id', context.tenantId).eq('user_id', userId).maybeSingle()
          if (error) throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể kiểm tra hồ sơ lời mời.')
          if (!data) return null
          return { employeeCode: data.employee_code, workEmail: data.work_email, fullName: data.full_name, departmentId: data.department_id, positionId: data.position_id, hireDate: data.hire_date, employmentStatus: data.employment_status }
        },
      }
      return createManualEmployeeInvitationService(repository, auth, runtime.public.appUrl).prepare(context, input)
    },
    async options(context) {
      if (!userDb) throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc danh mục.')
      const [departments, positions] = await Promise.all([
        userDb.from('departments').select('id, code, name').eq('tenant_id', context.tenantId).eq('company_id', context.companyId).eq('is_active', true).order('name'),
        userDb.from('positions').select('id, code, name, level').eq('tenant_id', context.tenantId).eq('company_id', context.companyId).eq('is_active', true).order('name'),
      ])
      const result = employeeInvitationOptionsSchema.safeParse({ departments: departments.data, positions: positions.data })
      if (departments.error || positions.error || !result.success) throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc phòng ban và chức danh.')
      return result.data
    },
    takeSlot: takeManualInvitationSlot,
  })
}
