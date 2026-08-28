import { describe, expect, it, vi } from 'vitest'
import {
  createAccessNavigationGuard,
  revalidateAccessAfterAuthAction,
  resolveAccessMiddlewareDecision,
  translateAccessDecision,
} from '../../../app/middleware/access.global'
import type { AuthLifecycle } from '../../../app/services/auth/access-policy'

vi.hoisted(() => {
  vi.stubGlobal('defineNuxtRouteMiddleware', <T>(middleware: T) => middleware)
})

function resolve(input: {
  path: string
  fullPath?: string
  lifecycle?: AuthLifecycle
  meta?: Record<string, unknown>
  companyIds?: string[]
  activeCompanyId?: string | null
  permissions?: string[]
  redirect?: unknown
}) {
  return resolveAccessMiddlewareDecision({
    path: input.path,
    fullPath: input.fullPath ?? input.path,
    query: { redirect: input.redirect },
    meta: input.meta ?? {},
  }, {
    lifecycle: input.lifecycle ?? 'anonymous',
    companies: (input.companyIds ?? []).map(companyId => ({ companyId })),
    activeCompanyId: input.activeCompanyId ?? null,
    permissions: input.permissions ?? [],
  })
}

describe('access middleware', () => {
  it('delegates public, guest, recovery, and default-authenticated modes to the access policy', () => {
    expect(resolve({ path: '/health', meta: { authMode: 'public' } })).toEqual({ type: 'allow' })
    expect(resolve({ path: '/login', meta: { authMode: 'guest', requiresCompany: false } })).toEqual({ type: 'allow' })
    expect(resolve({ path: '/auth/callback', meta: { authMode: 'recovery', requiresCompany: false } })).toEqual({ type: 'allow' })
    expect(resolve({ path: '/reset-password', meta: { authMode: 'recovery', requiresCompany: false } })).toEqual({ type: 'redirect', to: '/login' })
    expect(resolve({ path: '/projects', fullPath: '/projects?view=board#tasks' })).toEqual({
      type: 'redirect',
      to: '/login?redirect=%2Fprojects%3Fview%3Dboard%23tasks',
    })
  })

  it('fails closed during bootstrap and connection errors, and translates policy decisions to Nuxt navigation results', () => {
    const blocked = resolve({ path: '/projects', lifecycle: 'bootstrapping' })
    const connectionError = resolve({ path: '/projects', lifecycle: 'connection_error' })
    const navigateTo = (to: string) => ({ navigated: to })
    const abortNavigation = () => ({ aborted: true })

    expect(blocked).toEqual({ type: 'block', reason: 'bootstrapping' })
    expect(connectionError).toEqual({ type: 'block', reason: 'connection_error' })
    expect(translateAccessDecision(blocked, { navigateTo, abortNavigation })).toEqual({ aborted: true })
    expect(translateAccessDecision({ type: 'redirect', to: '/login' }, { navigateTo, abortNavigation })).toEqual({ navigated: '/login' })
    expect(translateAccessDecision({ type: 'allow' }, { navigateTo, abortNavigation })).toBeUndefined()
  })

  it('handles zero, one, and many company states including the access-state routes without loops', () => {
    expect(resolve({ path: '/projects', lifecycle: 'authenticated' })).toEqual({ type: 'redirect', to: '/no-access' })
    expect(resolve({ path: '/projects', lifecycle: 'authenticated', companyIds: ['company-1'], activeCompanyId: 'company-1' })).toEqual({ type: 'allow' })
    expect(resolve({ path: '/projects', lifecycle: 'authenticated', companyIds: ['company-1', 'company-2'] })).toEqual({ type: 'redirect', to: '/select-company' })
    expect(resolve({ path: '/select-company', lifecycle: 'authenticated' })).toEqual({ type: 'redirect', to: '/no-access' })
    expect(resolve({ path: '/select-company', lifecycle: 'authenticated', companyIds: ['company-1'], activeCompanyId: 'company-1' })).toEqual({ type: 'redirect', to: '/projects' })
    expect(resolve({ path: '/no-access', lifecycle: 'authenticated' })).toEqual({ type: 'allow' })
    expect(resolve({ path: '/forbidden', lifecycle: 'authenticated', companyIds: ['company-1'] })).toEqual({ type: 'allow' })
    expect(resolve({ path: '/select-company', fullPath: '/select-company?source=header', lifecycle: 'authenticated' })).toEqual({ type: 'redirect', to: '/no-access' })
    expect(resolve({ path: '/no-access', fullPath: '/no-access#details', lifecycle: 'authenticated' })).toEqual({ type: 'allow' })
    expect(resolve({ path: '/forbidden', fullPath: '/forbidden?from=%2Fprojects', lifecycle: 'authenticated', companyIds: ['company-1'] })).toEqual({ type: 'allow' })
  })

  it('enforces exact permission metadata and preserves only safe internal post-login redirects', () => {
    expect(resolve({
      path: '/projects',
      lifecycle: 'authenticated',
      companyIds: ['company-1'],
      activeCompanyId: 'company-1',
      meta: { requiredPermission: 'project.read' },
    })).toEqual({ type: 'redirect', to: '/forbidden' })
    expect(resolve({
      path: '/employees',
      lifecycle: 'authenticated',
      companyIds: ['company-1'],
      activeCompanyId: 'company-1',
      permissions: ['employee.read_directory'],
      meta: { requiredAnyPermissions: ['employee.read_directory', 'employee.read_all'] },
    })).toEqual({ type: 'allow' })
    expect(resolve({
      path: '/login',
      lifecycle: 'authenticated',
      companyIds: ['company-1'],
      activeCompanyId: 'company-1',
      meta: { authMode: 'guest', requiresCompany: false },
      redirect: 'https://evil.example/steal',
    })).toEqual({ type: 'redirect', to: '/projects' })
  })

  it('awaits the actual bootstrap readiness before resolving callback, guest, and protected-route navigation', async () => {
    let settleReadiness: (() => void) | undefined
    const authReady = new Promise<void>((resolve) => { settleReadiness = resolve })
    const stores = {
      lifecycle: 'bootstrapping' as AuthLifecycle,
      companies: [],
      activeCompanyId: null,
      permissions: [],
    }
    const navigateTo = (to: string) => ({ navigated: to })
    const abortNavigation = () => ({ aborted: true })
    const guard = createAccessNavigationGuard({
      authReady,
      getStores: () => stores,
      navigateTo,
      abortNavigation,
    })
    const callback = guard({ path: '/auth/callback', fullPath: '/auth/callback?token_hash=opaque&type=recovery', query: {}, meta: { authMode: 'recovery', requiresCompany: false } })
    const login = guard({ path: '/login', fullPath: '/login', query: {}, meta: { authMode: 'guest', requiresCompany: false } })
    const protectedRoute = guard({ path: '/projects', fullPath: '/projects?view=board', query: {}, meta: {} })

    await Promise.resolve()
    stores.lifecycle = 'anonymous'
    settleReadiness?.()

    await expect(callback).resolves.toBeUndefined()
    await expect(login).resolves.toBeUndefined()
    await expect(protectedRoute).resolves.toEqual({ navigated: '/login?redirect=%2Fprojects%3Fview%3Dboard' })
  })

  it('reloads after a successful retry or logout state change, but never reloads while the connection gate remains active', async () => {
    const reload = vi.fn()

    await revalidateAccessAfterAuthAction('authenticated', reload)
    await revalidateAccessAfterAuthAction('anonymous', reload)
    await revalidateAccessAfterAuthAction('connection_error', reload)

    expect(reload).toHaveBeenCalledTimes(2)
  })
})
