import { describe, expect, it, vi } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import { createAuthService } from '../../../app/services/auth/auth.service'
import { createRecoveryFlowStorage } from '../../../app/services/auth/recovery-flow.storage'
import type { SessionResponse } from '../../../app/repositories/http/http-session-repository'

const session: SessionResponse = {
  user: { id: 'user-1', email: 'member@example.com' },
  companies: [],
}

function error(code: ClientError['code'], kind: ClientError['kind'] = 'authentication') {
  return new ClientError({ code, kind, message: 'safe message', retryable: code === 'AUTH_INVALID' || code === 'NETWORK_ERROR' })
}

function createDependencies() {
  const authRepository = {
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    getAccessToken: vi.fn(async () => 'current-access-token'),
    refreshSession: vi.fn(async () => {}),
    requestPasswordReset: vi.fn(async () => {}),
    verifyEmailTokenHash: vi.fn(async () => {}),
    updatePassword: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
  }
  const sessionRepository = { get: vi.fn(async () => session) }
  const storage = new Map<string, string>()
  const recoveryFlow = createRecoveryFlowStorage({
    storage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    now: () => 100,
  })
  return { authRepository, sessionRepository, recoveryFlow }
}

describe('AuthService', () => {
  it('validates sign-in input before calling an authentication or session repository', async () => {
    const dependencies = createDependencies()
    const service = createAuthService({ ...dependencies, appUrl: 'https://taskovia.example' })

    await expect(service.signIn({ email: 'not-an-email', password: '' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })

    expect(dependencies.authRepository.signIn).not.toHaveBeenCalled()
    expect(dependencies.sessionRepository.get).not.toHaveBeenCalled()
  })

  it('creates a recovery lock before verification and clears it when callback verification fails', async () => {
    const dependencies = createDependencies()
    dependencies.authRepository.verifyEmailTokenHash.mockImplementation(async () => {
      expect(dependencies.recoveryFlow.get()).toEqual({ type: 'recovery', timestamp: 100 })
      throw error('INVALID_CREDENTIALS')
    })
    const service = createAuthService({ ...dependencies, appUrl: 'https://taskovia.example' })

    await expect(service.completeEmailCallback({ token_hash: 'opaque-hash', type: 'recovery' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })

    expect(dependencies.recoveryFlow.get()).toBeNull()
  })

  it('retains a non-secret recovery marker after verification and clears it after a valid reset', async () => {
    const dependencies = createDependencies()
    const service = createAuthService({ ...dependencies, appUrl: 'https://taskovia.example' })

    await service.completeEmailCallback({ token_hash: 'opaque-hash', type: 'recovery' })
    await expect(service.completePasswordReset({ password: 'a'.repeat(12), confirmation: 'a'.repeat(12) }))
      .resolves.toEqual(session)

    expect(dependencies.authRepository.updatePassword).toHaveBeenCalledTimes(1)
    expect(dependencies.recoveryFlow.get()).toBeNull()
  })

  it('preserves the provider session when app-session retrieval has a network failure', async () => {
    const dependencies = createDependencies()
    dependencies.sessionRepository.get.mockRejectedValue(error('NETWORK_ERROR', 'network'))
    const service = createAuthService({ ...dependencies, appUrl: 'https://taskovia.example' })

    await expect(service.restoreAppSession()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })

    expect(dependencies.authRepository.signOut).not.toHaveBeenCalled()
  })

  it('preserves the provider session when the app session fails after successful sign-in', async () => {
    const dependencies = createDependencies()
    dependencies.sessionRepository.get.mockRejectedValue(error('NETWORK_ERROR', 'network'))
    const service = createAuthService({ ...dependencies, appUrl: 'https://taskovia.example' })

    await expect(service.signIn({ email: 'member@example.com', password: 'current password' }))
      .rejects.toMatchObject({ code: 'NETWORK_ERROR' })

    expect(dependencies.authRepository.signIn).toHaveBeenCalledTimes(1)
    expect(dependencies.authRepository.signOut).not.toHaveBeenCalled()
  })

  it('preserves the recovery provider session when the app session fails after a successful password update', async () => {
    const dependencies = createDependencies()
    dependencies.recoveryFlow.begin('recovery')
    dependencies.sessionRepository.get.mockRejectedValue(error('INTERNAL_ERROR', 'api'))
    const service = createAuthService({ ...dependencies, appUrl: 'https://taskovia.example' })

    await expect(service.completePasswordReset({ password: 'a'.repeat(12), confirmation: 'a'.repeat(12) }))
      .rejects.toMatchObject({ code: 'INTERNAL_ERROR' })

    expect(dependencies.authRepository.updatePassword).toHaveBeenCalledTimes(1)
    expect(dependencies.authRepository.signOut).not.toHaveBeenCalled()
  })

  it('refreshes and retries an invalid app-session read exactly once before failing closed', async () => {
    const dependencies = createDependencies()
    dependencies.sessionRepository.get
      .mockRejectedValueOnce(error('AUTH_INVALID'))
      .mockRejectedValueOnce(error('AUTH_INVALID'))
    const service = createAuthService({ ...dependencies, appUrl: 'https://taskovia.example' })

    await expect(service.refreshAppSession()).rejects.toMatchObject({ code: 'AUTH_INVALID' })

    expect(dependencies.authRepository.refreshSession).toHaveBeenCalledTimes(1)
    expect(dependencies.sessionRepository.get).toHaveBeenCalledTimes(2)
    expect(dependencies.authRepository.signOut).toHaveBeenCalledTimes(1)
  })

  it('signs out when the one permitted refresh fails after an invalid app-session read', async () => {
    const dependencies = createDependencies()
    dependencies.sessionRepository.get.mockRejectedValue(error('AUTH_INVALID'))
    dependencies.authRepository.refreshSession.mockRejectedValue(error('NETWORK_ERROR', 'network'))
    const service = createAuthService({ ...dependencies, appUrl: 'https://taskovia.example' })

    await expect(service.refreshAppSession()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })

    expect(dependencies.authRepository.refreshSession).toHaveBeenCalledTimes(1)
    expect(dependencies.sessionRepository.get).toHaveBeenCalledTimes(1)
    expect(dependencies.authRepository.signOut).toHaveBeenCalledTimes(1)
  })

  it('does not retry a failed sign-in mutation', async () => {
    const dependencies = createDependencies()
    dependencies.authRepository.signIn.mockRejectedValue(error('NETWORK_ERROR', 'network'))
    const service = createAuthService({ ...dependencies, appUrl: 'https://taskovia.example' })

    await expect(service.signIn({ email: 'member@example.com', password: 'current password' }))
      .rejects.toMatchObject({ code: 'NETWORK_ERROR' })

    expect(dependencies.authRepository.signIn).toHaveBeenCalledTimes(1)
  })

  it('returns the same generic forgot-password outcome when the provider rejects the request', async () => {
    const dependencies = createDependencies()
    dependencies.authRepository.requestPasswordReset.mockRejectedValue(error('NETWORK_ERROR', 'network'))
    const service = createAuthService({ ...dependencies, appUrl: 'https://taskovia.example' })

    await expect(service.requestPasswordReset({ email: 'member@example.com' })).resolves.toBeUndefined()
  })
})
