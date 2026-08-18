import { z } from 'zod'
import {
  permissionCodeSchema,
  roleAssignmentResultSchema,
  type RoleAssignmentResult,
  type RoleSummary,
} from '../../../shared/schemas/rbac'
import { AppApiError } from '../../utils/api-error'
import type { UserSupabaseClient } from '../../utils/supabase-client'
import type { RoleLifecycleRepository } from './rbac.service'

interface QueryResult {
  data: unknown
  error: unknown
}

interface RoleQuery extends PromiseLike<QueryResult> {
  select(columns: string): RoleQuery
  eq(column: string, value: string | boolean): RoleQuery
  order(column: string, options?: { ascending?: boolean }): RoleQuery
}

interface RoleDataClient {
  from(table: 'roles'): RoleQuery
  rpc(
    functionName: 'grant_company_role_assignment',
    arguments_: {
      target_company_id: string
      target_user_id: string
      target_role_id: string
      target_grant_reason: string
    },
  ): Promise<QueryResult>
  rpc(
    functionName: 'revoke_company_role_assignment',
    arguments_: {
      target_assignment_id: number
      target_revoke_reason: string
    },
  ): Promise<QueryResult>
}

const roleRowSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  is_privileged: z.boolean(),
  is_system: z.boolean(),
  role_permissions: z.array(z.object({ permission_code: permissionCodeSchema }).strict()),
}).strict()

const roleAssignmentRowSchema = z.object({
  id: z.number().int().positive(),
  user_id: z.string().uuid(),
  role_id: z.string().uuid(),
}).passthrough()

const rpcErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
}).passthrough()

const roleColumns = 'id, code, name, description, is_privileged, is_system, role_permissions(permission_code)'

function failDatabase(): never {
  throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể xử lý vai trò công ty.')
}

function mapRoleAssignmentError(error: unknown): never {
  const parsed = rpcErrorSchema.safeParse(error)
  const message = parsed.success && parsed.data.code === 'P0001' ? parsed.data.message : undefined
  if (message === 'ROLE_ASSIGNMENT_CONFLICT' || parsed.success && parsed.data.code === '23505') {
    throw new AppApiError(409, 'ROLE_ASSIGNMENT_CONFLICT', 'Vai trò đang hoạt động.')
  }
  if (message === 'SELF_ROLE_CHANGE_FORBIDDEN') {
    throw new AppApiError(403, 'SELF_ROLE_CHANGE_FORBIDDEN', 'Bạn không thể tự thay đổi vai trò của mình.')
  }
  if (message === 'LAST_COMPANY_ADMIN_REQUIRED') {
    throw new AppApiError(409, 'LAST_COMPANY_ADMIN_REQUIRED', 'Công ty phải còn ít nhất một quản trị viên.')
  }
  if (message === 'PERMISSION_DENIED' || message === 'ONBOARDING_INCOMPLETE') {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
  return failDatabase()
}

function parseRoleAssignmentResult(data: unknown): RoleAssignmentResult {
  const parsed = z.union([
    roleAssignmentRowSchema,
    z.array(roleAssignmentRowSchema).length(1).transform(rows => rows[0]!),
  ]).safeParse(data)
  if (!parsed.success) return failDatabase()
  return roleAssignmentResultSchema.parse({
    id: parsed.data.id,
    targetUserId: parsed.data.user_id,
    roleId: parsed.data.role_id,
  })
}

export function createSupabaseRoleLifecycleRepository(db: UserSupabaseClient): RoleLifecycleRepository {
  const client = db as unknown as RoleDataClient

  return {
    async listActiveRoles(companyId) {
      const { data, error } = await client.from('roles')
        .select(roleColumns)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('code')
      const parsed = z.array(roleRowSchema).safeParse(data)
      if (error || !parsed.success) return failDatabase()
      return parsed.data.map(role => ({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isPrivileged: role.is_privileged,
        isSystem: role.is_system,
        permissions: [...new Set(role.role_permissions.map(permission => permission.permission_code))].sort(),
      })) satisfies RoleSummary[]
    },
    async grantRole(companyId, input) {
      const { data, error } = await client.rpc('grant_company_role_assignment', {
        target_company_id: companyId,
        target_user_id: input.targetUserId,
        target_role_id: input.roleId,
        target_grant_reason: input.reason,
      })
      if (error) return mapRoleAssignmentError(error)
      return parseRoleAssignmentResult(data)
    },
    async revokeRole(assignmentId, input) {
      const { data, error } = await client.rpc('revoke_company_role_assignment', {
        target_assignment_id: assignmentId,
        target_revoke_reason: input.reason,
      })
      if (error) return mapRoleAssignmentError(error)
      return parseRoleAssignmentResult(data)
    },
  }
}
