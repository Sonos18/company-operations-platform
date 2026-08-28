import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
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
