import { z } from 'zod'
import type { PermissionCode } from '../../../shared/constants/permissions'
import { permissionCodeSchema } from '../../../shared/schemas/rbac'
import { AppApiError } from '../../utils/api-error'
import type { UserSupabaseClient } from '../../utils/supabase-client'

const accessSchema = z.object({
  roles: z.array(z.string().trim().min(1)),
  permissions: z.array(permissionCodeSchema),
}).strict().transform(access => ({
  roles: [...new Set(access.roles)].sort(),
  permissions: [...new Set(access.permissions)].sort(),
}))

export type CompanyAuthorization = z.infer<typeof accessSchema>

export interface AuthorizationReader {
  listAccess(userId: string, companyId: string): Promise<CompanyAuthorization>
}

export function createAuthorizationService(reader: AuthorizationReader) {
  return {
    async requirePermission(userId: string, companyId: string, permission: PermissionCode) {
      const access = await reader.listAccess(userId, companyId)
      if (!access.permissions.includes(permission)) {
        throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
      }
      return access
    },
  }
}

interface AccessRpcClient {
  rpc(
    functionName: 'get_my_company_access',
    arguments_: { target_company_id: string },
  ): Promise<{ data: unknown; error: unknown }>
}

export function createSupabaseAuthorizationReader(db: UserSupabaseClient): AuthorizationReader {
  const rpc = db as unknown as AccessRpcClient

  return {
    async listAccess(_userId, companyId) {
      const { data, error } = await rpc.rpc('get_my_company_access', {
        target_company_id: companyId,
      })
      const result = z.array(accessSchema).length(1).safeParse(data)
      if (error || !result.success) {
        throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc quyền truy cập công ty.')
      }
      return result.data[0]!
    },
  }
}
