import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(() => {
  vi.stubGlobal('defineNuxtPlugin', <T>(plugin: T) => plugin)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appUrl: 'https://taskovia.example' } }))
})

import {
  default as authLifecyclePlugin,
  authLifecyclePluginOptions,
  createAuthLifecycle,
  createAuthRuntime,
} from '../../../app/plugins/auth-lifecycle.client'
import type { AuthLifecycle } from '../../../app/services/auth/access-policy'
import type { AuthLifecycleEvent, SupabaseAuthRepository } from '../../../app/repositories/auth/supabase-auth.repository'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

function createDocument() {
  let visibilityListener: (() => void) | undefined
  return {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: vi.fn((event: string, listener: () => void) => {
      if (event === 'visibilitychange') visibilityListener = listener
    }),
    removeEventListener: vi.fn((event: string, listener: () => void) => {
      if (event === 'visibilitychange' && visibilityListener === listener) visibilityListener = undefined
    }),
    emitVisibilityChange: () => visibilityListener?.(),
  }
}

function createStore(lifecycle: AuthLifecycle = 'authenticated') {
  return {
    lifecycle,
    initialize: vi.fn(async () => {}),
    handleAuthStateChange: vi.fn(async () => {}),
    refreshAppSession: vi.fn(async () => {}),
  }
}

function createRepository() {
  let listener: ((event: AuthLifecycleEvent) => void) | undefined
  const unsubscribe = vi.fn()
  return {
    repository: {
      subscribe: vi.fn((callback: (event: AuthLifecycleEvent) => void) => {
        listener = callback
        return unsubscribe
      }),
    },
    emit: (event: AuthLifecycleEvent) => listener?.(event),
    unsubscribe,
  }
}

function createRecoveryFlow(marker: { type: 'invite' | 'recovery', timestamp: number } | null = null) {
  return {
    get: vi.fn(() => marker),
    clear: vi.fn(),
  }
}

describe('auth lifecycle', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('runs after default providers, composes one runtime from the supplied provider repository, and initializes once', async () => {
    const authRepository = {
      getAccessToken: vi.fn(async () => null),
      subscribe: vi.fn(() => () => {}),
    } as unknown as SupabaseAuthRepository
    const runtime = createAuthRuntime({
      authRepository,
      appUrl: 'https://taskovia.example',
      localStorage: createStorage(),
      sessionStorage: createStorage(),
    })
    const document = createDocument()
    const lifecycle = createAuthLifecycle({
      authRepository,
      authStore: runtime.authStore,
      recoveryFlow: runtime.recoveryFlow,
      document,
    })

    await Promise.all([lifecycle.start(), lifecycle.start()])

    expect(authLifecyclePluginOptions.enforce).toBe('post')
    expect(authRepository.getAccessToken).toHaveBeenCalledTimes(1)
    expect(authRepository.subscribe).toHaveBeenCalledTimes(1)
    expect(runtime.authStore.lifecycle).toBe('anonymous')
    expect(runtime.companyAccessStore).toBeDefined()
  })

  it('runs the actual post plugin setup against the existing provider repository and provides singleton stores with readiness', async () => {
    const document = createDocument()
    const unsubscribe = vi.fn()
    const authRepository = {
      getAccessToken: vi.fn(async () => null),
      subscribe: vi.fn(() => unsubscribe),
    } as unknown as SupabaseAuthRepository
    const onUnmount = vi.fn()
    vi.stubGlobal('document', document)

    const result = authLifecyclePlugin.setup!({
      $authRepository: authRepository,
      vueApp: { onUnmount },
    } as never)
    const provided = result as { provide: {
      authStore: { lifecycle: AuthLifecycle }
      companyAccessStore: object
      authReady: Promise<void>
    } }
    await provided.provide.authReady

    expect(authLifecyclePluginOptions.enforce).toBe('post')
    expect(authRepository.getAccessToken).toHaveBeenCalledTimes(1)
    expect(authRepository.subscribe).toHaveBeenCalledTimes(1)
    expect(document.addEventListener).toHaveBeenCalledTimes(1)
    expect(provided.provide.authStore.lifecycle).toBe('anonymous')
    expect(provided.provide.companyAccessStore).toBeDefined()
    expect(onUnmount).toHaveBeenCalledTimes(1)

    const cleanup = onUnmount.mock.calls[0]?.[0] as () => void
    cleanup()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(document.removeEventListener).toHaveBeenCalledTimes(1)
  })

  it('enters recovery before readiness resolves when confirmed authentication has a valid recovery marker', async () => {
    const repository = createRepository()
    const authStore = createStore('authenticated')
    const recoveryFlow = createRecoveryFlow({ type: 'recovery', timestamp: 1 })
    const lifecycle = createAuthLifecycle({
      authRepository: repository.repository,
      authStore,
      recoveryFlow,
      document: createDocument(),
    })

    await lifecycle.start()

    expect(authStore.lifecycle).toBe('recovery')
    expect(recoveryFlow.clear).not.toHaveBeenCalled()
  })

  it('keeps authenticated bootstrap outside recovery when the marker is absent or expired', async () => {
    const repository = createRepository()
    const authStore = createStore('authenticated')
    const recoveryFlow = createRecoveryFlow()
    const lifecycle = createAuthLifecycle({
      authRepository: repository.repository,
      authStore,
      recoveryFlow,
      document: createDocument(),
    })

    await lifecycle.start()

    expect(authStore.lifecycle).toBe('authenticated')
    expect(recoveryFlow.clear).not.toHaveBeenCalled()
  })

  it('clears a recovery marker only after confirmed anonymous bootstrap without a provider session', async () => {
    const repository = createRepository()
    const authStore = createStore('anonymous')
    const recoveryFlow = createRecoveryFlow({ type: 'recovery', timestamp: 1 })
    const lifecycle = createAuthLifecycle({
      authRepository: repository.repository,
      authStore,
      recoveryFlow,
      document: createDocument(),
    })

    await lifecycle.start()

    expect(authStore.lifecycle).toBe('anonymous')
    expect(recoveryFlow.clear).toHaveBeenCalledTimes(1)
  })

  it('retains a valid recovery marker when initialization ends fail-closed with a connection error', async () => {
    const repository = createRepository()
    const authStore = createStore('connection_error')
    authStore.initialize.mockRejectedValue(new Error('safe connection failure'))
    const recoveryFlow = createRecoveryFlow({ type: 'recovery', timestamp: 1 })
    const lifecycle = createAuthLifecycle({
      authRepository: repository.repository,
      authStore,
      recoveryFlow,
      document: createDocument(),
    })

    await expect(lifecycle.start()).rejects.toThrow('safe connection failure')

    expect(authStore.lifecycle).toBe('connection_error')
    expect(recoveryFlow.clear).not.toHaveBeenCalled()
  })

  it('converts a synchronous subscription failure into one safe fail-closed initialization promise', async () => {
    const document = createDocument()
    const authStore = createStore('idle')
    const authRepository = {
      subscribe: vi.fn(() => { throw new TypeError('raw provider subscription failure') }),
    }
    const lifecycle = createAuthLifecycle({
      authRepository,
      authStore,
      recoveryFlow: createRecoveryFlow(),
      document,
    })

    const initialization = lifecycle.start()

    expect(lifecycle.start()).toBe(initialization)
    await expect(initialization).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    await expect(initialization).rejects.not.toThrow('raw provider subscription failure')
    expect(authStore.lifecycle).toBe('connection_error')
    expect(authStore.initialize).not.toHaveBeenCalled()
    expect(document.addEventListener).not.toHaveBeenCalled()
    lifecycle.cleanup()
    expect(document.removeEventListener).not.toHaveBeenCalled()
  })

  it('cleans a partially registered subscription exactly once when visibility listener registration throws', async () => {
    const unsubscribe = vi.fn()
    const document = createDocument()
    document.addEventListener.mockImplementation(() => { throw new TypeError('raw visibility listener failure') })
    const authStore = createStore('idle')
    const lifecycle = createAuthLifecycle({
      authRepository: { subscribe: vi.fn(() => unsubscribe) },
      authStore,
      recoveryFlow: createRecoveryFlow(),
      document,
    })

    await expect(lifecycle.start()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    lifecycle.cleanup()

    expect(authStore.lifecycle).toBe('connection_error')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(document.removeEventListener).not.toHaveBeenCalled()
  })

  it('keeps actual plugin setup available with a settled safe readiness promise after synchronous subscription failure', async () => {
    const document = createDocument()
    const authRepository = {
      getAccessToken: vi.fn(async () => null),
      subscribe: vi.fn(() => { throw new TypeError('raw provider subscription failure') }),
    } as unknown as SupabaseAuthRepository
    const onUnmount = vi.fn()
    vi.stubGlobal('document', document)

    let result: unknown
    expect(() => {
      result = authLifecyclePlugin.setup!({
        $authRepository: authRepository,
        vueApp: { onUnmount },
      } as never)
    }).not.toThrow()
    const provided = result as { provide: {
      authStore: { lifecycle: AuthLifecycle }
      authReady: Promise<void>
    } }
    await expect(provided.provide.authReady).resolves.toBeUndefined()

    expect(provided.provide.authStore.lifecycle).toBe('connection_error')
    expect(authRepository.subscribe).toHaveBeenCalledTimes(1)
    expect(document.addEventListener).not.toHaveBeenCalled()
    expect(onUnmount).toHaveBeenCalledTimes(1)
  })

  it('registers one auth subscription and visibility listener, then removes both during cleanup', async () => {
    const repository = createRepository()
    const document = createDocument()
    const authStore = createStore()
    const lifecycle = createAuthLifecycle({
      authRepository: repository.repository,
      authStore,
      recoveryFlow: createRecoveryFlow(),
      document,
    })

    await lifecycle.start()
    await lifecycle.start()
    lifecycle.cleanup()

    expect(repository.repository.subscribe).toHaveBeenCalledTimes(1)
    expect(document.addEventListener).toHaveBeenCalledTimes(1)
    expect(repository.unsubscribe).toHaveBeenCalledTimes(1)
    expect(document.removeEventListener).toHaveBeenCalledTimes(1)
  })

  it('forwards only meaningful provider events and suppresses sign-in/token events while recovery is active', async () => {
    const repository = createRepository()
    const document = createDocument()
    const authStore = createStore('recovery')
    const lifecycle = createAuthLifecycle({
      authRepository: repository.repository,
      authStore,
      recoveryFlow: createRecoveryFlow({ type: 'recovery', timestamp: 1 }),
      document,
    })
    await lifecycle.start()

    repository.emit({ event: 'INITIAL_SESSION', user: { id: 'user-1', email: 'member@example.com' } })
    repository.emit({ event: 'SIGNED_IN', user: { id: 'user-1', email: 'member@example.com' } })
    repository.emit({ event: 'TOKEN_REFRESHED', user: { id: 'user-1', email: 'member@example.com' } })
    repository.emit({ event: 'SIGNED_OUT', user: null })
    await Promise.resolve()

    expect(authStore.handleAuthStateChange).toHaveBeenCalledTimes(1)
    expect(authStore.handleAuthStateChange).toHaveBeenCalledWith({ event: 'SIGNED_OUT', user: null })
  })

  it('revalidates visible authenticated tabs with a short throttle and relies on the store single-flight', async () => {
    const repository = createRepository()
    const document = createDocument()
    const authStore = createStore()
    let now = 0
    const lifecycle = createAuthLifecycle({
      authRepository: repository.repository,
      authStore,
      recoveryFlow: createRecoveryFlow(),
      document,
      now: () => now,
      visibilityThrottleMs: 1_000,
    })
    await lifecycle.start()

    document.emitVisibilityChange()
    document.emitVisibilityChange()
    now = 999
    document.emitVisibilityChange()
    now = 1_000
    document.emitVisibilityChange()
    await Promise.resolve()

    expect(authStore.refreshAppSession).toHaveBeenCalledTimes(2)
  })
})
