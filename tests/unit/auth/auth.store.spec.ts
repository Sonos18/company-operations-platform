import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ClientError } from '../../../app/errors/client-error'
import { createAuthStore } from '../../../app/stores/auth/auth.store'
import { createCompanyAccessStore } from '../../../app/stores/company/company-access.store'
import { createActiveCompanyStorage } from '../../../app/services/auth/active-company.storage'
import {
  createPostProviderAppSessionFailure,
  type AuthService,
} from '../../../app/services/auth/auth.service'
import type { SessionResponse } from '../../../app/repositories/http/http-session-repository'

const session: SessionResponse = {
  user: { id: 'user-1', email: 'member@example.com' },
  companies: [],
}

function clientError(code: ClientError['code']) {
  return new ClientError({ kind: 'network', code, message: 'safe failure', retryable: true })
}

function createService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    restoreAppSession: vi.fn(async () => session),
    signIn: vi.fn(async () => session),
    requestPasswordReset: vi.fn(async () => {}),
    completeEmailCallback: vi.fn(async () => {}),
    completePasswordReset: vi.fn(async () => session),
    refreshAppSession: vi.fn(async () => session),
    signOut: vi.fn(async () => {}),
    ...overrides,
  }
}

function createStore(service: AuthService) {
  const activeCompanyStorage = createActiveCompanyStorage({
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  })
  const useCompanyAccessStore = createCompanyAccessStore({ activeCompanyStorage })
  const companyAccess = useCompanyAccessStore()
  return createAuthStore({ service, companyAccess })()
}

type AuthStore = ReturnType<typeof createStore>

describe('auth store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('moves through bootstrap to authenticated and tracks operation-specific state', async () => {
    const store = createStore(createService())

    const initialization = store.initialize()
    expect(store.lifecycle).toBe('bootstrapping')
    expect(store.operations.initialize.status).toBe('pending')
    await initialization

    expect(store.lifecycle).toBe('authenticated')
    expect(store.user).toEqual({ id: 'user-1', email: 'member@example.com' })
    expect(store.operations.initialize).toEqual({ status: 'success', error: null })
  })

  it('single-flights concurrent refreshes and renders a safe connection error', async () => {
    let resolveRefresh: ((value: SessionResponse) => void) | undefined
    const service = createService({
      refreshAppSession: vi.fn(() => new Promise<SessionResponse>((resolve) => { resolveRefresh = resolve })),
    })
    const store = createStore(service)

    const first = store.refreshAppSession()
    const second = store.refreshAppSession()
    expect(service.refreshAppSession).toHaveBeenCalledTimes(1)
    resolveRefresh?.(session)
    await Promise.all([first, second])

    ;(service.refreshAppSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(clientError('NETWORK_ERROR'))
    await expect(store.refreshAppSession()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(store.lifecycle).toBe('connection_error')
    expect(store.operations.refreshAppSession.error).toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('cleans auth and company state on logout without retaining provider tokens', async () => {
    const store = createStore(createService())
    await store.initialize()

    await store.signOut()

    expect(store.lifecycle).toBe('anonymous')
    expect(store.user).toBeNull()
    expect(JSON.stringify(store.$state)).not.toContain('access_token')
    expect(JSON.stringify(store.$state)).not.toContain('refresh_token')
    expect(JSON.stringify(store.$state)).not.toContain('provider')
  })

  it('suppresses a reentrant signed-in event emitted during callback verification until password reset completes', async () => {
    let store: ReturnType<typeof createStore>
    const service = createService({
      completeEmailCallback: vi.fn(async () => {
        await store.handleAuthStateChange({
          event: 'SIGNED_IN',
          user: { id: 'user-1', email: 'member@example.com' },
        })
      }),
    })
    store = createStore(service)

    await store.completeEmailCallback({ token_hash: 'opaque-hash', type: 'recovery' })

    expect(service.refreshAppSession).not.toHaveBeenCalled()
    expect(store.lifecycle).toBe('recovery')
    expect(store.user).toBeNull()
  })

  it('enters connection_error after a successful sign-in cannot load the app session', async () => {
    const service = createService({ signIn: vi.fn(async () => { throw createPostProviderAppSessionFailure(clientError('NETWORK_ERROR')) }) })
    const store = createStore(service)

    await expect(store.signIn({ email: 'member@example.com', password: 'current password' }))
      .rejects.toMatchObject({ code: 'NETWORK_ERROR' })

    expect(store.lifecycle).toBe('connection_error')
    expect(store.operations.signIn.error).toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('enters connection_error after a successful password reset cannot load the app session', async () => {
    const service = createService({ completePasswordReset: vi.fn(async () => { throw createPostProviderAppSessionFailure(clientError('INTERNAL_ERROR')) }) })
    const store = createStore(service)

    await expect(store.completePasswordReset({ password: 'a'.repeat(12), confirmation: 'a'.repeat(12) }))
      .rejects.toMatchObject({ code: 'INTERNAL_ERROR' })

    expect(store.lifecycle).toBe('connection_error')
    expect(store.operations.completePasswordReset.error).toMatchObject({ code: 'INTERNAL_ERROR' })
  })

  it.each([
    ['AUTH_INVALID', 'signIn', (store: AuthStore) => store.signIn({ email: 'member@example.com', password: 'current password' })],
    ['AUTH_INVALID', 'completePasswordReset', (store: AuthStore) => store.completePasswordReset({ password: 'a'.repeat(12), confirmation: 'a'.repeat(12) })],
    ['AUTH_REQUIRED', 'completePasswordReset', (store: AuthStore) => store.completePasswordReset({ password: 'a'.repeat(12), confirmation: 'a'.repeat(12) })],
  ] as const)('clears app state and leaves recovery when post-provider %s from %s cannot authorize', async (code, _operation, invoke) => {
    const invalidContinuation = createPostProviderAppSessionFailure(new ClientError({
      kind: 'authentication',
      code,
      message: 'safe failure',
      retryable: false,
    }))
    const service = createService({
      signIn: vi.fn(async () => { throw invalidContinuation }),
      completePasswordReset: vi.fn(async () => { throw invalidContinuation }),
    })
    const store = createStore(service)
    await store.initialize()
    await store.completeEmailCallback({ token_hash: 'opaque-hash', type: 'recovery' })

    await expect(invoke(store)).rejects.toMatchObject({ code })

    expect(store.lifecycle).toBe('anonymous')
    expect(store.user).toBeNull()
    expect(store.operations.completePasswordReset.status).not.toBe('pending')
  })

  it.each([
    ['signIn', (store: AuthStore) => store.signIn({ email: 'member@example.com', password: 'current password' })],
    ['completePasswordReset', (store: AuthStore) => store.completePasswordReset({ password: 'a'.repeat(12), confirmation: 'a'.repeat(12) })],
  ] as const)('keeps provider mutation network failure as an operation error for %s', async (_operation, invoke) => {
    const service = createService({
      signIn: vi.fn(async () => { throw clientError('NETWORK_ERROR') }),
      completePasswordReset: vi.fn(async () => { throw clientError('NETWORK_ERROR') }),
    })
    const store = createStore(service)

    await expect(invoke(store)).rejects.toMatchObject({ code: 'NETWORK_ERROR' })

    expect(store.lifecycle).not.toBe('connection_error')
  })

  it('does not classify validation, authentication, or authorization failures as connection errors', async () => {
    for (const code of ['VALIDATION_FAILED', 'INVALID_CREDENTIALS', 'PERMISSION_DENIED'] as const) {
      setActivePinia(createPinia())
      const service = createService({ signIn: vi.fn(async () => { throw new ClientError({
        kind: code === 'VALIDATION_FAILED' ? 'validation' : code === 'INVALID_CREDENTIALS' ? 'authentication' : 'authorization',
        code,
        message: 'safe failure',
        retryable: false,
      }) }) })
      const store = createStore(service)

      await expect(store.signIn({ email: 'member@example.com', password: 'current password' })).rejects.toMatchObject({ code })
      expect(store.lifecycle).not.toBe('connection_error')
    }
  })
})
