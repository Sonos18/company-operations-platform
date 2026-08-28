import { createAuthenticatedHttpClient } from '../repositories/http/authenticated-http-client'
import { createHttpSessionRepository } from '../repositories/http/http-session-repository'
import type { AuthLifecycleEvent, SupabaseAuthRepository } from '../repositories/auth/supabase-auth.repository'
import { createActiveCompanyStorage, type BrowserStorage } from '../services/auth/active-company.storage'
import { createAuthService } from '../services/auth/auth.service'
import { createRecoveryFlowStorage, type RecoveryFlowStorage } from '../services/auth/recovery-flow.storage'
import type { AuthLifecycle } from '../services/auth/access-policy'
import { createAuthStore } from '../stores/auth/auth.store'
import { createCompanyAccessStore } from '../stores/company/company-access.store'

const meaningfulAuthEvents = new Set(['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'])
const recoverySuppressedEvents = new Set(['SIGNED_IN', 'TOKEN_REFRESHED'])
const defaultVisibilityThrottleMs = 1_000

export interface LifecycleAuthStore {
  lifecycle: AuthLifecycle
  initialize(): Promise<void>
  handleAuthStateChange(event: AuthLifecycleEvent): Promise<void>
  refreshAppSession(): Promise<void>
}

export interface BrowserDocument {
  visibilityState: DocumentVisibilityState
  addEventListener(event: 'visibilitychange', listener: () => void): void
  removeEventListener(event: 'visibilitychange', listener: () => void): void
}

export interface AuthLifecycleOptions {
  authRepository: Pick<SupabaseAuthRepository, 'subscribe'>
  authStore: LifecycleAuthStore
  recoveryFlow: Pick<RecoveryFlowStorage, 'get'>
  document: BrowserDocument
  now?: () => number
  visibilityThrottleMs?: number
}

export interface AuthRuntimeOptions {
  authRepository: SupabaseAuthRepository
  appUrl: string
  localStorage?: BrowserStorage
  sessionStorage?: BrowserStorage
  fetch?: typeof globalThis.fetch
}

export function createAuthRuntime(options: AuthRuntimeOptions) {
  const useCompanyAccessStore = createCompanyAccessStore({
    activeCompanyStorage: createActiveCompanyStorage({ storage: options.localStorage }),
  })
  const companyAccessStore = useCompanyAccessStore()
  const recoveryFlow = createRecoveryFlowStorage({ storage: options.sessionStorage })
  const sessionRepository = createHttpSessionRepository(createAuthenticatedHttpClient({
    getAccessToken: () => options.authRepository.getAccessToken(),
    fetch: options.fetch,
  }))
  const useAuthStore = createAuthStore({
    service: createAuthService({
      authRepository: options.authRepository,
      sessionRepository,
      recoveryFlow,
      appUrl: options.appUrl,
    }),
    companyAccess: companyAccessStore,
  })

  return {
    authStore: useAuthStore(),
    companyAccessStore,
    recoveryFlow,
  }
}

export function createAuthLifecycle(options: AuthLifecycleOptions) {
  const now = options.now ?? Date.now
  const visibilityThrottleMs = options.visibilityThrottleMs ?? defaultVisibilityThrottleMs
  let started = false
  let initialization: Promise<void> | null = null
  let unsubscribe: (() => void) | null = null
  let lastVisibleRefreshAt = Number.NEGATIVE_INFINITY

  function ignoreFailure(promise: Promise<unknown>): void {
    void promise.catch(() => {})
  }

  function onAuthStateChange(event: AuthLifecycleEvent): void {
    if (!meaningfulAuthEvents.has(event.event)) return

    const recoveryActive = options.authStore.lifecycle === 'recovery' || options.recoveryFlow.get() !== null
    if (recoveryActive && recoverySuppressedEvents.has(event.event)) return

    ignoreFailure(options.authStore.handleAuthStateChange(event))
  }

  function onVisibilityChange(): void {
    if (options.document.visibilityState !== 'visible' || options.authStore.lifecycle !== 'authenticated') return

    const timestamp = now()
    if (timestamp - lastVisibleRefreshAt < visibilityThrottleMs) return

    lastVisibleRefreshAt = timestamp
    ignoreFailure(options.authStore.refreshAppSession())
  }

  return {
    start(): Promise<void> {
      if (initialization) return initialization

      started = true
      unsubscribe = options.authRepository.subscribe(onAuthStateChange)
      options.document.addEventListener('visibilitychange', onVisibilityChange)
      initialization = options.authStore.initialize()
      return initialization
    },
    cleanup(): void {
      if (!started) return
      unsubscribe?.()
      unsubscribe = null
      options.document.removeEventListener('visibilitychange', onVisibilityChange)
      started = false
    },
  }
}

// `supabase.client.ts` is an anonymous default plugin, so Nuxt cannot resolve it through `dependsOn`.
// A post plugin runs after the default provider stage and consumes its one existing repository injection.
export const authLifecyclePluginOptions = {
  name: 'auth-lifecycle',
  enforce: 'post' as const,
}

export default defineNuxtPlugin({
  name: 'auth-lifecycle',
  enforce: 'post',
  setup(nuxtApp) {
    const authRepository = nuxtApp.$authRepository as SupabaseAuthRepository
    if (!authRepository) throw new Error('Supabase Auth repository is unavailable.')

    const runtimeConfig = useRuntimeConfig()
    const runtime = createAuthRuntime({
      authRepository,
      appUrl: runtimeConfig.public.appUrl,
    })
    const lifecycle = createAuthLifecycle({
      authRepository,
      authStore: runtime.authStore,
      recoveryFlow: runtime.recoveryFlow,
      document,
    })

    ignoreLifecycleInitialization(lifecycle.start())
    nuxtApp.vueApp.onUnmount(lifecycle.cleanup)

    return {
      provide: {
        authStore: runtime.authStore,
        companyAccessStore: runtime.companyAccessStore,
      },
    }
  },
})

function ignoreLifecycleInitialization(initialization: Promise<void>): void {
  void initialization.catch(() => {})
}
