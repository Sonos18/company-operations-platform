import { createAuthenticatedHttpClient } from '../repositories/http/authenticated-http-client'
import { createHttpSessionRepository } from '../repositories/http/http-session-repository'
import type { AuthLifecycleEvent, SupabaseAuthRepository } from '../repositories/auth/supabase-auth.repository'
import { createActiveCompanyStorage, type BrowserStorage } from '../services/auth/active-company.storage'
import { createAuthService } from '../services/auth/auth.service'
import { createRecoveryFlowStorage, type RecoveryFlowStorage } from '../services/auth/recovery-flow.storage'
import type { AuthLifecycle } from '../services/auth/access-policy'
import { createAuthStore } from '../stores/auth/auth.store'
import { createCompanyAccessStore } from '../stores/company/company-access.store'
import { ClientError } from '../errors/client-error'

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
  recoveryFlow: Pick<RecoveryFlowStorage, 'get' | 'clear'>
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
  let visibilityListenerRegistered = false
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

  function registrationFailure(): ClientError {
    return new ClientError({
      kind: 'network',
      code: 'NETWORK_ERROR',
      message: 'Không thể kết nối đến dịch vụ xác thực. Vui lòng thử lại.',
      retryable: true,
    })
  }

  function cleanupRegistrations(): void {
    const activeUnsubscribe = unsubscribe
    unsubscribe = null

    if (visibilityListenerRegistered) {
      visibilityListenerRegistered = false
      options.document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    activeUnsubscribe?.()
  }

  function finalizeRecoveryLifecycle(): void {
    const recoveryMarker = options.recoveryFlow.get()
    if (options.authStore.lifecycle === 'authenticated' && recoveryMarker) {
      options.authStore.lifecycle = 'recovery'
    }
    else if (options.authStore.lifecycle === 'anonymous' && recoveryMarker) {
      options.recoveryFlow.clear()
    }
  }

  function beginInitialization(resolve: () => void, reject: (error?: unknown) => void): void {
    try {
      unsubscribe = options.authRepository.subscribe(onAuthStateChange)
      options.document.addEventListener('visibilitychange', onVisibilityChange)
      visibilityListenerRegistered = true
    }
    catch {
      options.authStore.lifecycle = 'connection_error'
      cleanupRegistrations()
      started = false
      reject(registrationFailure())
      return
    }

    try {
      void options.authStore.initialize().then(
        () => {
          finalizeRecoveryLifecycle()
          resolve()
        },
        (error) => {
          finalizeRecoveryLifecycle()
          reject(error)
        },
      )
    }
    catch {
      options.authStore.lifecycle = 'connection_error'
      finalizeRecoveryLifecycle()
      reject(registrationFailure())
    }
  }

  return {
    start(): Promise<void> {
      if (initialization) return initialization

      let resolveInitialization!: () => void
      let rejectInitialization!: (error?: unknown) => void
      initialization = new Promise<void>((resolve, reject) => {
        resolveInitialization = resolve
        rejectInitialization = reject
      })
      started = true
      beginInitialization(resolveInitialization, rejectInitialization)
      return initialization
    },
    cleanup(): void {
      if (!started) return
      cleanupRegistrations()
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

    // This promise is intentionally fulfilled after the store has left its transient bootstrap state,
    // including connection failures, so global middleware can make a final policy decision.
    const authReady = lifecycle.start().catch(() => {})
    nuxtApp.vueApp.onUnmount(lifecycle.cleanup)

    return {
      provide: {
        authStore: runtime.authStore,
        companyAccessStore: runtime.companyAccessStore,
        authReady,
      },
    }
  },
})
