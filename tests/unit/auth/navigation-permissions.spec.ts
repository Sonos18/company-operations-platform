import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canonicalAdminLinks,
  canonicalNavigationLinks,
  filterNavigationLinks,
  type NavigationLink,
} from '../../../app/components/app/navigation-permissions'
import type { PermissionCode } from '../../../shared/constants/permissions'

const drawingsPageSource = readFileSync(
  new URL('../../../app/pages/projects/[projectId]/stages/[stageId]/drawings.vue', import.meta.url),
  'utf8',
)

function accessFor(permissions: readonly PermissionCode[]) {
  return {
    hasPermission: (permission: PermissionCode) => permissions.includes(permission),
    hasAnyPermission: (requiredPermissions: readonly PermissionCode[]) => requiredPermissions.some(permission => permissions.includes(permission)),
  }
}

describe('navigation permissions', () => {
  it('shows only the business links granted by canonical permissions', () => {
    expect(filterNavigationLinks(canonicalNavigationLinks, accessFor(['project.read', 'employee.read_all'])).map(link => link.to))
      .toEqual(['/projects', '/employees'])

    expect(filterNavigationLinks(canonicalNavigationLinks, accessFor(['task.read_assigned', 'employee.read_directory'])).map(link => link.to))
      .toEqual(['/my-work', '/employees'])

    expect(filterNavigationLinks(canonicalNavigationLinks, accessFor(['opportunity.read'])).map(link => link.to))
      .toEqual(['/opportunities'])
  })

  it('exposes the Stage 01 configuration admin link only to users with its read permission', () => {
    expect(canonicalAdminLinks).toEqual([
      {
        to: '/settings/stage-01',
        label: 'Cấu hình',
        icon: 'i-lucide-settings-2',
        requiredPermission: 'stage01.config.read',
      },
    ])
    expect(filterNavigationLinks(canonicalAdminLinks, accessFor([]))).toEqual([])
    expect(filterNavigationLinks(canonicalAdminLinks, accessFor(['stage01.config.read']))).toEqual(canonicalAdminLinks)
    expect(canonicalNavigationLinks).toEqual([
      { to: '/projects', label: 'Dự án', icon: 'i-lucide-panels-top-left', requiredPermission: 'project.read' },
      { to: '/my-work', label: 'Công việc của tôi', icon: 'i-lucide-circle-check-big', requiredPermission: 'task.read_assigned' },
      { to: '/employees', label: 'Nhân sự', icon: 'i-lucide-users-round', requiredAnyPermissions: ['employee.read_directory', 'employee.read_all'] },
      { to: '/opportunities', label: 'Cơ hội', icon: 'i-lucide-target', requiredPermission: 'opportunity.read' },
    ])
  })

  it('requires both project access and drawing access for a drawing route', () => {
    const drawingMeta = drawingsPageSource.match(/definePageMeta\(\{\s*requiredPermission:\s*'([^']+)',\s*requiredAnyPermissions:\s*\['([^']+)'\]\s*\}\)/s)
    expect(drawingMeta?.slice(1)).toEqual(['project.read', 'drawing.read'])
    const [requiredPermission, requiredAnyPermission] = drawingMeta?.slice(1) ?? []
    const drawingLink: NavigationLink = {
      to: '/projects/project-1/stages/stage-1/drawings',
      label: 'Bản vẽ',
      icon: 'i-lucide-ruler',
      requiredPermission: requiredPermission as PermissionCode,
      requiredAnyPermissions: [requiredAnyPermission as PermissionCode],
    }

    expect(filterNavigationLinks([drawingLink], accessFor(['project.read']))).toEqual([])
    expect(filterNavigationLinks([drawingLink], accessFor(['drawing.read']))).toEqual([])
    expect(filterNavigationLinks([drawingLink], accessFor(['project.read', 'drawing.read']))).toEqual([drawingLink])
  })
})
