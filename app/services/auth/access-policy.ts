import type { PermissionCode } from '../../../shared/constants/permissions'
import { sanitizeInternalRedirect } from '../../../shared/utils/app-url'

export type AuthLifecycle =
  | 'idle'
  | 'bootstrapping'
  | 'anonymous'
  | 'authenticated'
  | 'connection_error'
  | 'recovery'

export type AuthMode = 'public' | 'guest' | 'recovery' | 'authenticated'

export interface AccessNavigationInput {
  path: string
  lifecycle: AuthLifecycle
  authMode?: AuthMode
  requiresCompany?: boolean
  requiredPermission?: PermissionCode
  requiredAnyPermissions?: readonly PermissionCode[]
  companyIds?: readonly string[]
  activeCompanyId?: string | null
  permissions?: readonly PermissionCode[]
  redirect?: unknown
}

export type AccessDecision =
  | { type: 'allow' }
  | { type: 'block', reason: 'bootstrapping' | 'connection_error' }
  | { type: 'redirect', to: string }

const allow: AccessDecision = { type: 'allow' }
const blockedAccessStatePaths = new Set(['/select-company', '/no-access', '/forbidden'])

function redirect(to: string): AccessDecision {
  return { type: 'redirect', to }
}

function routePath(value: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'

  try {
    const url = new URL(value, 'https://taskovia.internal')
    return url.origin === 'https://taskovia.internal' ? url.pathname : '/'
  }
  catch {
    return '/'
  }
}

function hasSelectedCompany(input: AccessNavigationInput): boolean {
  return input.activeCompanyId !== undefined
    && input.activeCompanyId !== null
    && (input.companyIds ?? []).includes(input.activeCompanyId)
}

function resolveAuthenticatedDestination(input: AccessNavigationInput): string {
  const companyIds = input.companyIds ?? []
  const selectedCompany = hasSelectedCompany(input)

  if (companyIds.length === 0) return '/no-access'
  if (companyIds.length > 1 && !selectedCompany) return '/select-company'

  const candidate = sanitizeInternalRedirect(input.redirect)
  if (candidate && !blockedAccessStatePaths.has(new URL(candidate, 'https://taskovia.internal').pathname)) {
    return candidate
  }
  return '/projects'
}

function resolveAccessStateNavigation(input: AccessNavigationInput): AccessDecision | null {
  const companyIds = input.companyIds ?? []
  const selectedCompany = hasSelectedCompany(input)

  if (input.path === '/select-company') {
    if (companyIds.length === 0) return redirect('/no-access')
    if (companyIds.length === 1 || selectedCompany) return redirect('/projects')
    return allow
  }
  if (input.path === '/no-access') {
    if (companyIds.length === 0) return allow
    return redirect(companyIds.length > 1 && !selectedCompany ? '/select-company' : '/projects')
  }
  if (input.path === '/forbidden') return allow

  return null
}

export function resolveAccessNavigation(input: AccessNavigationInput): AccessDecision {
  const authMode = input.authMode ?? 'authenticated'
  const requiresCompany = input.requiresCompany ?? true
  const internalPath = sanitizeInternalRedirect(input.path) ?? '/'
  const currentPath = routePath(input.path)

  if (authMode === 'public') return allow
  if (input.lifecycle === 'bootstrapping') return { type: 'block', reason: 'bootstrapping' }
  if (input.lifecycle === 'connection_error') return { type: 'block', reason: 'connection_error' }

  if (input.lifecycle === 'recovery') {
    return authMode === 'recovery' ? allow : redirect('/reset-password')
  }
  if (input.lifecycle === 'anonymous' || input.lifecycle === 'idle') {
    if (authMode === 'guest' || (authMode === 'recovery' && currentPath === '/auth/callback')) {
      return allow
    }
    return internalPath === '/' ? redirect('/login') : redirect(`/login?redirect=${encodeURIComponent(internalPath)}`)
  }

  if (authMode === 'guest' || authMode === 'recovery') {
    return redirect(resolveAuthenticatedDestination(input))
  }

  const accessStateDecision = resolveAccessStateNavigation(input)
  if (accessStateDecision) return accessStateDecision

  if (requiresCompany) {
    const companyIds = input.companyIds ?? []
    if (companyIds.length === 0) return redirect('/no-access')
    if (companyIds.length > 1 && !hasSelectedCompany(input)) return redirect('/select-company')
  }

  const permissions = new Set(input.permissions ?? [])
  if (input.requiredPermission && !permissions.has(input.requiredPermission)) return redirect('/forbidden')
  if (input.requiredAnyPermissions?.length
    && !input.requiredAnyPermissions.some(permission => permissions.has(permission))) {
    return redirect('/forbidden')
  }

  return allow
}
