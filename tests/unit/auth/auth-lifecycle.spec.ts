import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(() => {
  vi.stubGlobal('defineNuxtPlugin', <T>(plugin: T) => plugin)
})

import {
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

  it('registers one auth subscription and visibility listener, then removes both during cleanup', async () => {
    const repository = createRepository()
    const document = createDocument()
    const authStore = createStore()
    const lifecycle = createAuthLifecycle({
      authRepository: repository.repository,
      authStore,
      recoveryFlow: { get: () => null },
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
      recoveryFlow: { get: () => ({ type: 'recovery', timestamp: 1 }) },
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
      recoveryFlow: { get: () => null },
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
