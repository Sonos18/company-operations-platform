import type { PermissionCode } from '../../../shared/constants/permissions'
import type {
  EmployeeDetail,
  EmployeeListQuery,
  EmployeeListResponse,
  EmployeeUpdateInput,
} from '../../../shared/schemas/employees'
import { AppApiError } from '../../utils/api-error'
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

export function createEmployeeService(repository: EmployeeRepository) {
  return {
    async list(context: EmployeeServiceContext, query: EmployeeListQuery): Promise<EmployeeListResponse> {
      requirePermission(context, 'employee.read_directory')
      const result = await repository.listDirectory(context.companyId, query.page, query.pageSize)
      return { items: result.items, page: query.page, pageSize: query.pageSize, total: result.total }
    },
    async detail(context: EmployeeServiceContext, employeeId: string): Promise<EmployeeDetail> {
      requirePermission(context, 'employee.read_directory')
      const employee = await repository.getDirectoryEmployee(context.companyId, employeeId)
      if (!employee) return notFound()

      const canReadPrivate = context.permissions.includes('employee.read_private')
        || (employee.account?.userId === context.actorId
          && context.permissions.includes('employee.read_self_private'))
      if (!canReadPrivate) return employee

      const privateDetails = await repository.getPrivateDetails(context.companyId, employeeId)
      return privateDetails ? { ...employee, privateDetails } : employee
    },
    async update(
      context: EmployeeServiceContext,
      employeeId: string,
      input: EmployeeUpdateInput,
    ): Promise<EmployeeDetail> {
      requirePermission(context, 'employee.update')
      const employee = await repository.updateEmployee(context.companyId, employeeId, input)
      return employee ?? notFound()
    },
  }
}
