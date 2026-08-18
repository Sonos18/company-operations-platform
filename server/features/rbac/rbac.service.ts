import type { PermissionCode } from '../../../shared/constants/permissions'
import type {
  RoleAssignmentInput,
  RoleAssignmentResult,
  RoleAssignmentRevokeInput,
  RoleSummary,
} from '../../../shared/schemas/rbac'
import { AppApiError } from '../../utils/api-error'

export interface RoleLifecycleServiceContext {
  actorId: string
  tenantId: string
  companyId: string
  permissions: readonly PermissionCode[]
}

export interface RoleLifecycleRepository {
  listActiveRoles(companyId: string): Promise<RoleSummary[]>
  grantRole(companyId: string, input: RoleAssignmentInput): Promise<RoleAssignmentResult>
  revokeRole(
    companyId: string,
    assignmentId: number,
    input: RoleAssignmentRevokeInput,
  ): Promise<RoleAssignmentResult>
}

function requirePermission(context: RoleLifecycleServiceContext, permission: PermissionCode) {
  if (!context.permissions.includes(permission)) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}

export function createRoleLifecycleService(repository: RoleLifecycleRepository) {
  return {
    async list(context: RoleLifecycleServiceContext): Promise<RoleSummary[]> {
      requirePermission(context, 'role.read')
      return repository.listActiveRoles(context.companyId)
    },
    async authorizeGrant(context: RoleLifecycleServiceContext): Promise<void> {
      requirePermission(context, 'role.assign')
    },
    async authorizeRevoke(context: RoleLifecycleServiceContext): Promise<void> {
      requirePermission(context, 'role.revoke')
    },
    async grant(
      context: RoleLifecycleServiceContext,
      input: RoleAssignmentInput,
    ): Promise<RoleAssignmentResult> {
      requirePermission(context, 'role.assign')
      return repository.grantRole(context.companyId, input)
    },
    async revoke(
      context: RoleLifecycleServiceContext,
      assignmentId: number,
      input: RoleAssignmentRevokeInput,
    ): Promise<RoleAssignmentResult> {
      requirePermission(context, 'role.revoke')
      return repository.revokeRole(context.companyId, assignmentId, input)
    },
  }
}
