import type { PermissionCode } from '../../../../shared/constants/permissions'
import { workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import { AppApiError } from '../../../utils/api-error'
import type { MaterialProcurementContext } from '../material-procurement/service'

export type MaterialFinanceContext = MaterialProcurementContext

export const financeReadPermissions: readonly PermissionCode[] = [
  'material.finance.read', 'material.contract.record', 'material.payment.request',
  'material.payment.approve', 'material.payment.execute',
]

export function requirePermission(context: MaterialFinanceContext, permission: PermissionCode): void {
  if (!context.permissions.includes('material.read') || !context.permissions.includes(permission)) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}

export function requireFinanceRead(context: MaterialFinanceContext): void {
  if (!context.permissions.includes('material.read')
    || !financeReadPermissions.some(permission => context.permissions.includes(permission))) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}

export function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value)
  }
  catch {
    throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
  }
}

export const id = (value: string) => parse(workflowUuidSchema, value)

// T1, T2, T3 each add their own interface slice and service class in separate files
// (contract-service.ts, payment-service.ts, finance-read-service.ts) so parallel tasks never edit the same file.
