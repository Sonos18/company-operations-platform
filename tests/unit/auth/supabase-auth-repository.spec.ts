import { describe, expect, it } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import {
  createSupabaseAuthRepository,
  type NarrowSupabaseAuthClient,
  type SupabaseAuthRepository,
} from '../../../app/repositories/auth/supabase-auth.repository'
import { signInInputSchema } from '../../../shared/schemas/auth'

type ProviderResult = { data: unknown; error: unknown }

async function expectSafeFailure(operation: () => Promise<unknown>, code: string, rawDetail: string) {
  const error = await operation().catch(error => error)

  expect(error).toBeInstanceOf(ClientError)
  expect(error).toMatchObject({ code })
  expect((error as Error).message).not.toContain(rawDetail)
}

function createClient(overrides: Partial<NarrowSupabaseAuthClient['auth']> = {}) {
  const calls = {
    signIn: [] as Array<{ email: string; password: string }>,
    signOut: 0,
    getSession: 0,
    refreshSession: 0,
    reset: [] as Array<{ email: string; redirectTo?: string }>,
    verify: [] as Array<{ token_hash: string; type: string }>,
    update: [] as Array<{ password: string }>,
    setSession: [] as Array<{ access_token: string; refresh_token: string }>,
    signOutScopes: [] as Array<'global' | 'local' | 'others' | undefined>,
    unsubscribe: 0,
  }
  let listener: ((event: string, session: {
    access_token: string
    refresh_token: string
    user: { id: string; email: string | null }
  } | null) => void) | undefined

  const sessionSuccess = (): Promise<ProviderResult> => Promise.resolve({
    data: {
      session: {
        access_token: 'provider-access-token',
        refresh_token: 'provider-refresh-token',
        user: { id: 'user-1', email: 'user@example.com' },
      },
    },
    error: null,
  })
  const success = (): Promise<ProviderResult> => Promise.resolve({ data: {}, error: null })
  const client: NarrowSupabaseAuthClient = {
    auth: {
      signInWithPassword: input => {
        calls.signIn.push(input)
        return sessionSuccess()
      },
      signOut: (options) => {
        calls.signOut += 1
        calls.signOutScopes.push(options?.scope)
        return success()
      },
      getSession: () => {
        calls.getSession += 1
        return Promise.resolve({ data: { session: null }, error: null })
      },
      refreshSession: () => {
        calls.refreshSession += 1
        return sessionSuccess()
      },
      resetPasswordForEmail: (email, options) => {
        calls.reset.push({ email, redirectTo: options?.redirectTo })
        return success()
      },
      verifyOtp: input => {
        calls.verify.push(input)
        return sessionSuccess()
      },
      updateUser: input => {
        calls.update.push(input)
        return success()
      },
      setSession: input => {
        calls.setSession.push(input)
        return sessionSuccess()
      },
      onAuthStateChange: callback => {
        listener = callback
        return { data: { subscription: { unsubscribe: () => { calls.unsubscribe += 1 } } } }
      },
      ...overrides,
    },
  }

  return {
    calls,
    client,
    emit: (event: string, session: {
      access_token: string
      refresh_token: string
      user: { id: string; email: string | null }
    } | null) => listener?.(event, session),
  }
}

describe('SupabaseAuthRepository', () => {
  it('forwards parsed sign-in values and maps returned provider errors without leaking details', async () => {
    const fake = createClient()
    fake.client.auth.signInWithPassword = input => {
      fake.calls.signIn.push(input)
      return Promise.resolve({ data: null, error: { code: 'invalid_credentials', message: 'raw provider credentials body' } })
    }
    const repository = createSupabaseAuthRepository(fake.client)
    const input = signInInputSchema.parse({ email: ' USER@Example.com ', password: ' password is unchanged ' })

    await expect(repository.signIn(input)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Email hoặc mật khẩu không chính xác.',
    })
    expect(fake.calls.signIn).toEqual([{
      email: 'user@example.com',
      password: ' password is unchanged ',
    }])
  })

  it('uses exact reset and token-hash payloads without a code exchange', async () => {
    const fake = createClient()
    const repository = createSupabaseAuthRepository(fake.client)

    await repository.requestPasswordReset({
      email: 'user@example.com',
      redirectTo: 'https://taskovia.example/auth/callback',
    })
    await repository.verifyEmailTokenHash({ tokenHash: 'opaque-token-hash', type: 'recovery' })

    expect(fake.calls.reset).toEqual([{
      email: 'user@example.com',
      redirectTo: 'https://taskovia.example/auth/callback',
    }])
    expect(fake.calls.verify).toEqual([{ token_hash: 'opaque-token-hash', type: 'recovery' }])
  })

  it('maps thrown provider failures and returns only the current access token to its caller', async () => {
    const fake = createClient({
      refreshSession: () => Promise.reject(new TypeError('fetch raw provider body')),
      getSession: () => Promise.resolve({
        data: {
          session: {
            access_token: 'access-token-for-http-gateway-only',
            refresh_token: 'must-not-leak',
            user: { id: 'user-1', email: 'user@example.com' },
          },
        },
        error: null,
      }),
    })
    const repository = createSupabaseAuthRepository(fake.client)

    await expect(repository.refreshSession()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Không thể kết nối đến dịch vụ xác thực. Vui lòng thử lại.',
    })
    await expect(repository.refreshSession()).rejects.not.toThrow('raw provider body')
    await expect(repository.getAccessToken()).resolves.toBe('access-token-for-http-gateway-only')
  })

  it('forwards sign-out and password updates through the repository boundary', async () => {
    const fake = createClient()
    const repository = createSupabaseAuthRepository(fake.client)

    await repository.signOut()
    await repository.updatePassword('a replacement passphrase')

    expect(fake.calls.signOut).toBe(1)
    expect(fake.calls.update).toEqual([{ password: 'a replacement passphrase' }])
  })

  it('isolates recovery verification and promotes it only after password update', async () => {
    const persistent = createClient()
    const recovery = createClient({
      getSession: () => Promise.resolve({
        data: {
          session: {
            access_token: 'recovery-access-token',
            refresh_token: 'recovery-refresh-token',
            user: { id: 'user-1', email: 'user@example.com' },
          },
        },
        error: null,
      }),
    })
    const repository = createSupabaseAuthRepository(persistent.client, recovery.client)

    await repository.verifyEmailTokenHash({ tokenHash: 'opaque-token-hash', type: 'recovery' })
    await expect(repository.getAccessToken()).resolves.toBeNull()
    await expect(repository.getRecoveryAccessToken()).resolves.toBe('recovery-access-token')
    await repository.updatePassword('a replacement passphrase')
    await repository.promoteRecoverySession()

    expect(recovery.calls.verify).toEqual([{ token_hash: 'opaque-token-hash', type: 'recovery' }])
    expect(persistent.calls.verify).toEqual([])
    expect(recovery.calls.update).toEqual([{ password: 'a replacement passphrase' }])
    expect(persistent.calls.update).toEqual([])
    expect(persistent.calls.setSession).toEqual([{
      access_token: 'recovery-access-token',
      refresh_token: 'recovery-refresh-token',
    }])
    expect(recovery.calls.signOutScopes).toEqual(['local'])
  })

  it('clears only the isolated recovery client without signing out the persistent client', async () => {
    const persistent = createClient()
    const recovery = createClient()
    const repository = createSupabaseAuthRepository(persistent.client, recovery.client)

    await repository.clearRecoverySession()

    expect(recovery.calls.signOutScopes).toEqual(['local'])
    expect(persistent.calls.signOut).toBe(0)
  })

  it('normalizes lifecycle events and returns a synchronous unsubscribe function', () => {
    const fake = createClient()
    const repository = createSupabaseAuthRepository(fake.client)
    const events: unknown[] = []

    const unsubscribe = repository.subscribe(event => events.push(event))
    fake.emit('SIGNED_IN', {
      access_token: 'never-forwarded',
      refresh_token: 'never-forwarded',
      user: { id: 'user-1', email: 'user@example.com' },
    })
    fake.emit('SIGNED_OUT', null)
    unsubscribe()

    expect(events).toEqual([
      { event: 'SIGNED_IN', user: { id: 'user-1', email: 'user@example.com' } },
      { event: 'SIGNED_OUT', user: null },
    ])
    expect(JSON.stringify(events)).not.toContain('never-forwarded')
    expect(fake.calls.unsubscribe).toBe(1)
  })

  it('never exposes a raw provider error as the public error cause', async () => {
    const fake = createClient({
      signOut: () => Promise.resolve({ data: null, error: { code: 'unexpected_failure', message: 'secret provider response body' } }),
    })
    const repository = createSupabaseAuthRepository(fake.client)

    await expect(repository.signOut()).rejects.toBeInstanceOf(ClientError)
    await expect(repository.signOut()).rejects.not.toThrow('secret provider response body')
  })

  it.each([
    {
      name: 'sign-in',
      configure: (client: NarrowSupabaseAuthClient) => {
        client.auth.signInWithPassword = () => Promise.resolve({ data: {}, error: null })
      },
      invoke: (repository: SupabaseAuthRepository) => repository.signIn(
        signInInputSchema.parse({ email: 'user@example.com', password: 'password' }),
      ),
    },
    {
      name: 'session refresh',
      configure: (client: NarrowSupabaseAuthClient) => {
        client.auth.refreshSession = () => Promise.resolve({ data: {}, error: null })
      },
      invoke: (repository: SupabaseAuthRepository) => repository.refreshSession(),
    },
    {
      name: 'token-hash verification',
      configure: (client: NarrowSupabaseAuthClient) => {
        client.auth.verifyOtp = () => Promise.resolve({ data: {}, error: null })
      },
      invoke: (repository: SupabaseAuthRepository) => repository.verifyEmailTokenHash({
        tokenHash: 'opaque-token-hash',
        type: 'recovery',
      }),
    },
  ])('rejects malformed successful $name responses', async ({ configure, invoke }) => {
    const fake = createClient()
    configure(fake.client)

    await expectSafeFailure(
      () => invoke(createSupabaseAuthRepository(fake.client)),
      'MALFORMED_RESPONSE',
      'provider',
    )
  })

  it('maps a synchronous subscription setup failure without leaking provider details', () => {
    const fake = createClient({
      onAuthStateChange: () => {
        throw new TypeError('fetch subscription raw provider detail')
      },
    })
    const repository = createSupabaseAuthRepository(fake.client)

    let error: unknown
    try {
      repository.subscribe(() => {})
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ClientError)
    expect(error).toMatchObject({ code: 'NETWORK_ERROR' })
    expect((error as Error).message).not.toContain('raw provider detail')
  })

  it.each([
    {
      name: 'getAccessToken',
      returned: (client: NarrowSupabaseAuthClient) => {
        client.auth.getSession = () => Promise.resolve({
          data: { session: null },
          error: { code: 'invalid_credentials', message: 'raw returned get-session detail' },
        })
      },
      thrown: (client: NarrowSupabaseAuthClient) => {
        client.auth.getSession = () => Promise.reject(new TypeError('fetch raw thrown get-session detail'))
      },
      invoke: (repository: SupabaseAuthRepository) => repository.getAccessToken(),
    },
    {
      name: 'requestPasswordReset',
      returned: (client: NarrowSupabaseAuthClient) => {
        client.auth.resetPasswordForEmail = () => Promise.resolve({
          data: null,
          error: { code: 'invalid_credentials', message: 'raw returned reset detail' },
        })
      },
      thrown: (client: NarrowSupabaseAuthClient) => {
        client.auth.resetPasswordForEmail = () => Promise.reject(new TypeError('fetch raw thrown reset detail'))
      },
      invoke: (repository: SupabaseAuthRepository) => repository.requestPasswordReset({
        email: 'user@example.com',
        redirectTo: 'https://taskovia.example/auth/callback',
      }),
    },
    {
      name: 'verifyEmailTokenHash',
      returned: (client: NarrowSupabaseAuthClient) => {
        client.auth.verifyOtp = () => Promise.resolve({
          data: null,
          error: { code: 'invalid_credentials', message: 'raw returned verify detail' },
        })
      },
      thrown: (client: NarrowSupabaseAuthClient) => {
        client.auth.verifyOtp = () => Promise.reject(new TypeError('fetch raw thrown verify detail'))
      },
      invoke: (repository: SupabaseAuthRepository) => repository.verifyEmailTokenHash({
        tokenHash: 'opaque-token-hash',
        type: 'recovery',
      }),
    },
    {
      name: 'updatePassword',
      returned: (client: NarrowSupabaseAuthClient) => {
        client.auth.updateUser = () => Promise.resolve({
          data: null,
          error: { code: 'invalid_credentials', message: 'raw returned update detail' },
        })
      },
      thrown: (client: NarrowSupabaseAuthClient) => {
        client.auth.updateUser = () => Promise.reject(new TypeError('fetch raw thrown update detail'))
      },
      invoke: (repository: SupabaseAuthRepository) => repository.updatePassword('a replacement passphrase'),
    },
  ])('maps returned and thrown provider errors from $name', async ({ returned, thrown, invoke }) => {
    const returnedFake = createClient()
    returned(returnedFake.client)
    await expectSafeFailure(
      () => invoke(createSupabaseAuthRepository(returnedFake.client)),
      'INVALID_CREDENTIALS',
      'raw returned',
    )

    const thrownFake = createClient()
    thrown(thrownFake.client)
    await expectSafeFailure(
      () => invoke(createSupabaseAuthRepository(thrownFake.client)),
      'NETWORK_ERROR',
      'raw thrown',
    )
  })
})
