import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ClientError } from '../../../app/errors/client-error'
import { createAuthStore } from '../../../app/stores/auth/auth.store'
import { createCompanyAccessStore } from '../../../app/stores/company/company-access.store'
import { createActiveCompanyStorage } from '../../../app/services/auth/active-company.storage'
import type { AuthService } from '../../../app/services/auth/auth.service'
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
})
