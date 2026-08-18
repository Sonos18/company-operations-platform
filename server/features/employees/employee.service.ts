import type { PermissionCode } from '../../../shared/constants/permissions'
import type {
  EmployeeDetail,
  EmployeeInvitationInput,
  EmployeeListQuery,
  EmployeeListResponse,
  EmployeeUpdateInput,
} from '../../../shared/schemas/employees'
import { employeeDetailSchema } from '../../../shared/schemas/employees'
import { AppApiError } from '../../utils/api-error'
import type { EmployeeInvitationAuthAdmin } from './employee-invitation-auth'
import type { EmployeeRepository } from './employee.repository'

export interface EmployeeServiceContext {
  actorId: string
  tenantId: string
  companyId: string
  permissions: readonly PermissionCode[]
}

function requirePermission(context: EmployeeServiceContext, permission: PermissionCode) {
  if (!context.permissions.includes(permission)) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}

function notFound(): never {
  throw new AppApiError(404, 'EMPLOYEE_NOT_FOUND', 'Không tìm thấy nhân viên.')
}

function accountInviteFailed(): never {
  throw new AppApiError(502, 'ACCOUNT_INVITE_FAILED', 'Không thể gửi lời mời tài khoản.')
}

function onboardingIncomplete(): never {
  throw new AppApiError(409, 'ONBOARDING_INCOMPLETE', 'Hồ sơ nhân viên chưa hoàn tất.')
}

function normalizeInvitation(input: EmployeeInvitationInput): EmployeeInvitationInput {
  return { ...input, workEmail: input.workEmail.trim().toLowerCase() }
}

function validatedOnboardingResult(
  employee: EmployeeDetail | null,
  workEmail: string,
): EmployeeDetail {
  const parsed = employeeDetailSchema.safeParse(employee)
  if (!parsed.success
    || parsed.data.workEmail !== workEmail) {
    return onboardingIncomplete()
  }
  return parsed.data
}

async function withPrivateDetails(
  repository: EmployeeRepository,
  context: EmployeeServiceContext,
  employee: EmployeeDetail,
  employeeId: string,
): Promise<EmployeeDetail> {
  const { privateDetails: _privateDetails, ...directoryEmployee } = employee
  const canReadPrivate = context.permissions.includes('employee.read_private')
    || (directoryEmployee.account?.userId === context.actorId
      && context.permissions.includes('employee.read_self_private'))
  if (!canReadPrivate) return directoryEmployee
  const privateDetails = await repository.getPrivateDetails(context.companyId, employeeId)
  return privateDetails ? { ...directoryEmployee, privateDetails } : directoryEmployee
}

export function createEmployeeService(repository: EmployeeRepository) {
  return {
    async authorizeInvitation(context: EmployeeServiceContext): Promise<void> {
      requirePermission(context, 'account.invite')
      requirePermission(context, 'employee.create')
    },
    async invite(
      context: EmployeeServiceContext,
      input: EmployeeInvitationInput,
      auth: EmployeeInvitationAuthAdmin | (() => EmployeeInvitationAuthAdmin),
    ): Promise<EmployeeDetail> {
      requirePermission(context, 'account.invite')
      requirePermission(context, 'employee.create')
      const normalizedInput = normalizeInvitation(input)
      const authAdmin = typeof auth === 'function' ? auth() : auth

      let invitation
      try {
        invitation = await authAdmin.inviteUser(normalizedInput.workEmail)
      } catch {
        return accountInviteFailed()
      }

      let userId: string
      if (invitation.kind === 'invited') {
        userId = invitation.userId
      } else if (invitation.kind === 'existing') {
        let existingUser
        try {
          existingUser = await authAdmin.findUserByEmail(normalizedInput.workEmail)
        } catch {
          return accountInviteFailed()
        }
        if (existingUser.kind !== 'found') return accountInviteFailed()
        userId = existingUser.userId
      } else {
        return accountInviteFailed()
      }

      try {
        return validatedOnboardingResult(
          await repository.completeEmployeeOnboarding(context.companyId, userId, normalizedInput),
          normalizedInput.workEmail,
        )
      } catch (error) {
        if (error instanceof AppApiError && (
          error.code === 'EMPLOYEE_EMAIL_CONFLICT'
          || error.code === 'ONBOARDING_INCOMPLETE'
          || error.code === 'PERMISSION_DENIED'
        )) {
          throw error
        }
        return onboardingIncomplete()
      }
    },
    async list(context: EmployeeServiceContext, query: EmployeeListQuery): Promise<EmployeeListResponse> {
      requirePermission(context, 'employee.read_directory')
      const result = await repository.listDirectory(context.companyId, query.page, query.pageSize)
      return { items: result.items, page: query.page, pageSize: query.pageSize, total: result.total }
    },
    async detail(context: EmployeeServiceContext, employeeId: string): Promise<EmployeeDetail> {
      requirePermission(context, 'employee.read_directory')
      const employee = await repository.getDirectoryEmployee(context.companyId, employeeId)
      if (!employee) return notFound()

      return withPrivateDetails(repository, context, employee, employeeId)
    },
    async update(
      context: EmployeeServiceContext,
      employeeId: string,
      input: EmployeeUpdateInput,
    ): Promise<EmployeeDetail> {
      requirePermission(context, 'employee.update')
      const employee = await repository.updateEmployee(context.companyId, employeeId, input)
      if (!employee) return notFound()
      return withPrivateDetails(repository, context, employee, employeeId)
    },
  }
}
