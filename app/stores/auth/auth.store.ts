import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { ClientError } from '../../errors/client-error'
import type { AuthLifecycle } from '../../services/auth/access-policy'
import type { AuthService } from '../../services/auth/auth.service'
import type { AuthLifecycleEvent } from '../../repositories/auth/supabase-auth.repository'
import type { CompanyAccessStore } from '../company/company-access.store'

type OperationName =
  | 'initialize'
  | 'signIn'
  | 'signOut'
  | 'requestPasswordReset'
  | 'completeEmailCallback'
  | 'completePasswordReset'
  | 'refreshAppSession'

export interface OperationState {
  status: 'idle' | 'pending' | 'success' | 'error'
  error: ClientError | null
}

export interface AuthStoreOptions {
  service: AuthService
  companyAccess: CompanyAccessStore
}

function createOperations(): Record<OperationName, OperationState> {
  return {
    initialize: { status: 'idle', error: null },
    signIn: { status: 'idle', error: null },
    signOut: { status: 'idle', error: null },
    requestPasswordReset: { status: 'idle', error: null },
    completeEmailCallback: { status: 'idle', error: null },
    completePasswordReset: { status: 'idle', error: null },
    refreshAppSession: { status: 'idle', error: null },
  }
}

function asClientError(error: unknown): ClientError {
  return error instanceof ClientError
    ? error
    : new ClientError({
      kind: 'unexpected',
      code: 'INTERNAL_ERROR',
      message: 'Hệ thống gặp lỗi ngoài dự kiến.',
      retryable: false,
    })
}

export function createAuthStore(options: AuthStoreOptions) {
  return defineStore('auth', () => {
    const lifecycle = ref<AuthLifecycle>('idle')
    const user = ref<{ id: string, email: string | null } | null>(null)
    const operations = reactive(createOperations())
    let initializationFlight: Promise<void> | null = null
    let refreshFlight: Promise<void> | null = null

    function setPending(operation: OperationName): void {
      operations[operation] = { status: 'pending', error: null }
    }

    function setSuccess(operation: OperationName): void {
      operations[operation] = { status: 'success', error: null }
    }

    function setError(operation: OperationName, error: unknown): ClientError {
      const clientError = asClientError(error)
      operations[operation] = { status: 'error', error: clientError }
      return clientError
    }

    function applySession(session: Awaited<ReturnType<AuthService['refreshAppSession']>>): void {
      user.value = session.user
      options.companyAccess.applySession(session)
      lifecycle.value = 'authenticated'
    }

    function clearSession(): void {
      user.value = null
      options.companyAccess.clear()
    }

    async function initialize(): Promise<void> {
      if (initializationFlight) return initializationFlight
      initializationFlight = (async () => {
        setPending('initialize')
        lifecycle.value = 'bootstrapping'
        try {
          const session = await options.service.restoreAppSession()
          if (session) applySession(session)
          else {
            clearSession()
            lifecycle.value = 'anonymous'
          }
          setSuccess('initialize')
        }
        catch (error) {
          const clientError = setError('initialize', error)
          if (clientError.code === 'AUTH_INVALID') {
            clearSession()
            lifecycle.value = 'anonymous'
          }
          else lifecycle.value = 'connection_error'
          throw clientError
        }
        finally {
          initializationFlight = null
        }
      })()
      return initializationFlight
    }

    async function signIn(input: Parameters<AuthService['signIn']>[0]): Promise<void> {
      setPending('signIn')
      try {
        applySession(await options.service.signIn(input))
        setSuccess('signIn')
      }
      catch (error) {
        throw setError('signIn', error)
      }
    }

    async function signOut(): Promise<void> {
      setPending('signOut')
      try {
        await options.service.signOut()
        setSuccess('signOut')
      }
      catch (error) {
        throw setError('signOut', error)
      }
      finally {
        clearSession()
        lifecycle.value = 'anonymous'
      }
    }

    async function requestPasswordReset(input: Parameters<AuthService['requestPasswordReset']>[0]): Promise<void> {
      setPending('requestPasswordReset')
      try {
        await options.service.requestPasswordReset(input)
        setSuccess('requestPasswordReset')
      }
      catch (error) {
        throw setError('requestPasswordReset', error)
      }
    }

    async function completeEmailCallback(input: Parameters<AuthService['completeEmailCallback']>[0]): Promise<void> {
      setPending('completeEmailCallback')
      try {
        await options.service.completeEmailCallback(input)
        lifecycle.value = 'recovery'
        setSuccess('completeEmailCallback')
      }
      catch (error) {
        throw setError('completeEmailCallback', error)
      }
    }

    async function completePasswordReset(input: Parameters<AuthService['completePasswordReset']>[0]): Promise<void> {
      setPending('completePasswordReset')
      try {
        applySession(await options.service.completePasswordReset(input))
        setSuccess('completePasswordReset')
      }
      catch (error) {
        throw setError('completePasswordReset', error)
      }
    }

    async function refreshAppSession(): Promise<void> {
      if (refreshFlight) return refreshFlight
      refreshFlight = (async () => {
        setPending('refreshAppSession')
        try {
          applySession(await options.service.refreshAppSession())
          setSuccess('refreshAppSession')
        }
        catch (error) {
          const clientError = setError('refreshAppSession', error)
          if (clientError.code === 'AUTH_INVALID') {
            clearSession()
            lifecycle.value = 'anonymous'
          }
          else lifecycle.value = 'connection_error'
          throw clientError
        }
        finally {
          refreshFlight = null
        }
      })()
      return refreshFlight
    }

    async function retryConnection(): Promise<void> {
      await refreshAppSession()
    }

    async function handleAuthStateChange(event: AuthLifecycleEvent): Promise<void> {
      if (event.event === 'SIGNED_OUT') {
        clearSession()
        lifecycle.value = 'anonymous'
        return
      }
      if (lifecycle.value !== 'recovery' && event.user) await refreshAppSession()
    }

    return {
      lifecycle,
      user,
      operations,
      initialize,
      signIn,
      signOut,
      requestPasswordReset,
      completeEmailCallback,
      completePasswordReset,
      refreshAppSession,
      retryConnection,
      handleAuthStateChange,
    }
  })
}
