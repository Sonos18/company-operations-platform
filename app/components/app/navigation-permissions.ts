import type { PermissionCode } from '../../../shared/constants/permissions'

export interface NavigationLink {
  to: string
  label: string
  icon: string
  requiredPermission?: PermissionCode
  requiredAnyPermissions?: readonly PermissionCode[]
}

export interface NavigationPermissionAccess {
  hasPermission(permission: PermissionCode): boolean
  hasAnyPermission(permissions: readonly PermissionCode[]): boolean
}

export const canonicalNavigationLinks: readonly NavigationLink[] = [
  { to: '/projects', label: 'Dự án', icon: 'i-lucide-panels-top-left', requiredPermission: 'project.read' },
  { to: '/my-work', label: 'Công việc của tôi', icon: 'i-lucide-circle-check-big', requiredPermission: 'task.read_assigned' },
  {
    to: '/employees',
    label: 'Nhân sự',
    icon: 'i-lucide-users-round',
    requiredAnyPermissions: ['employee.read_directory', 'employee.read_all'],
  },
  { to: '/opportunities', label: 'Cơ hội', icon: 'i-lucide-target', requiredPermission: 'opportunity.read' },
]

export const canonicalAdminLinks: readonly NavigationLink[] = [
  { to: '/settings/stage-01', label: 'Cấu hình', icon: 'i-lucide-settings-2', requiredPermission: 'stage01.config.read' },
]

export function hasNavigationPermission(link: NavigationLink, access: NavigationPermissionAccess): boolean {
  return (!link.requiredPermission || access.hasPermission(link.requiredPermission))
    && (!link.requiredAnyPermissions || access.hasAnyPermission(link.requiredAnyPermissions))
}

export function filterNavigationLinks(
  links: readonly NavigationLink[],
  access: NavigationPermissionAccess,
): NavigationLink[] {
  return links.filter(link => hasNavigationPermission(link, access))
}
