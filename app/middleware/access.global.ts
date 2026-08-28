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

export function resolveAccessMiddlewareDecision(route: AccessRoute, stores: AccessMiddlewareStores): AccessDecision {
  return resolveAccessNavigation({
    path: route.fullPath,
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

export default defineNuxtRouteMiddleware((to) => {
  const nuxtApp = useNuxtApp()
  const decision = resolveAccessMiddlewareDecision(to, {
    lifecycle: nuxtApp.$authStore.lifecycle,
    companies: nuxtApp.$companyAccessStore.companies,
    activeCompanyId: nuxtApp.$companyAccessStore.activeCompanyId,
    permissions: nuxtApp.$companyAccessStore.permissions,
  })

  return translateAccessDecision(decision, { navigateTo, abortNavigation })
})
