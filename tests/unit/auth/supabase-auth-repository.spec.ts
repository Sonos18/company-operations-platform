import { describe, expect, it } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import {
  createSupabaseAuthRepository,
  type NarrowSupabaseAuthClient,
} from '../../../app/repositories/auth/supabase-auth.repository'
import { signInInputSchema } from '../../../shared/schemas/auth'

type ProviderResult = { data: unknown; error: unknown }

function createClient(overrides: Partial<NarrowSupabaseAuthClient['auth']> = {}) {
  const calls = {
    signIn: [] as Array<{ email: string; password: string }>,
    signOut: 0,
    getSession: 0,
    refreshSession: 0,
    reset: [] as Array<{ email: string; redirectTo?: string }>,
    verify: [] as Array<{ token_hash: string; type: string }>,
    update: [] as Array<{ password: string }>,
    unsubscribe: 0,
  }
  let listener: ((event: string, session: {
    access_token: string
    refresh_token: string
    user: { id: string; email: string | null }
  } | null) => void) | undefined

  const success = (): Promise<ProviderResult> => Promise.resolve({ data: {}, error: null })
  const client: NarrowSupabaseAuthClient = {
    auth: {
      signInWithPassword: input => {
        calls.signIn.push(input)
        return success()
      },
      signOut: () => {
        calls.signOut += 1
        return success()
      },
      getSession: () => {
        calls.getSession += 1
        return Promise.resolve({ data: { session: null }, error: null })
      },
      refreshSession: () => {
        calls.refreshSession += 1
        return success()
      },
      resetPasswordForEmail: (email, options) => {
        calls.reset.push({ email, redirectTo: options?.redirectTo })
        return success()
      },
      verifyOtp: input => {
        calls.verify.push(input)
        return success()
      },
      updateUser: input => {
        calls.update.push(input)
        return success()
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
})
