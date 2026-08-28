import type { RouteLocationNormalizedLoaded } from 'vue-router'
import {
  resolveAccessNavigation,
  type AccessDecision,
  type AuthLifecycle,
} from '../services/auth/access-policy'
import type { PermissionCode } from '../../shared/constants/permissions'

export interface AccessMiddlewareStores {
  lifecycle: AuthLifecycle
  companies: Array<{ companyId: string }>
  activeCompanyId: string | null
  permissions: readonly PermissionCode[]
}

type AccessRoute = Pick<RouteLocationNormalizedLoaded, 'path' | 'fullPath' | 'query' | 'meta'>
const accessStatePaths = new Set(['/select-company', '/no-access', '/forbidden'])

function policyPath(route: AccessRoute): string {
  return accessStatePaths.has(route.path) ? route.path : route.fullPath
}

export function resolveAccessMiddlewareDecision(route: AccessRoute, stores: AccessMiddlewareStores): AccessDecision {
  return resolveAccessNavigation({
    path: policyPath(route),
    lifecycle: stores.lifecycle,
    authMode: route.meta.authMode,
    requiresCompany: route.meta.requiresCompany,
    requiredPermission: route.meta.requiredPermission,
    requiredAnyPermissions: route.meta.requiredAnyPermissions,
    companyIds: stores.companies.map(company => company.companyId),
    activeCompanyId: stores.activeCompanyId,
    permissions: stores.permissions,
    redirect: route.query.redirect,
  })
}

export function translateAccessDecision<NavigateResult, AbortResult>(
  decision: AccessDecision,
  navigation: {
    navigateTo: (to: string) => NavigateResult
    abortNavigation: () => AbortResult
  },
): NavigateResult | AbortResult | undefined {
  if (decision.type === 'redirect') return navigation.navigateTo(decision.to)
  if (decision.type === 'block') return navigation.abortNavigation()
  return undefined
}

export function createAccessNavigationGuard<NavigateResult, AbortResult>(options: {
  authReady: Promise<void>
  getStores: () => AccessMiddlewareStores
  navigateTo: (to: string) => NavigateResult
  abortNavigation: () => AbortResult
}) {
  return async (route: AccessRoute): Promise<NavigateResult | AbortResult | undefined> => {
    const initialStores = options.getStores()
    if (initialStores.lifecycle === 'idle' || initialStores.lifecycle === 'bootstrapping') {
      await options.authReady
    }

    return translateAccessDecision(
      resolveAccessMiddlewareDecision(route, options.getStores()),
      options,
    )
  }
}

export async function revalidateAccessAfterAuthAction(
  lifecycle: AuthLifecycle,
  reload: () => void | Promise<void>,
): Promise<void> {
  if (lifecycle !== 'authenticated' && lifecycle !== 'anonymous') return
  await reload()
}

export default defineNuxtRouteMiddleware(async (to) => {
  const nuxtApp = useNuxtApp()
  const guard = createAccessNavigationGuard({
    authReady: nuxtApp.$authReady,
    getStores: () => ({
      lifecycle: nuxtApp.$authStore.lifecycle,
      companies: nuxtApp.$companyAccessStore.companies,
      activeCompanyId: nuxtApp.$companyAccessStore.activeCompanyId,
      permissions: nuxtApp.$companyAccessStore.permissions,
    }),
    navigateTo,
    abortNavigation,
  })

  return guard(to)
})
