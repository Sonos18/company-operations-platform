import type { PermissionCode } from '../../shared/constants/permissions'

declare module 'nuxt/app' {
  interface PageMeta {
    authMode?: 'public' | 'guest' | 'recovery' | 'authenticated'
    requiresCompany?: boolean
    requiredPermission?: PermissionCode
    requiredAnyPermissions?: PermissionCode[]
  }
}

export {}
