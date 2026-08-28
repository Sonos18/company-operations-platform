import type { z } from 'zod'
import { ClientError } from '../../errors/client-error'
import { mapSupabaseAuthError } from '../../errors/auth-error-mapper'
import { signInInputSchema, type AuthEmailFlow } from '../../../shared/schemas/auth'

export type SignInInput = z.infer<typeof signInInputSchema>

type ProviderResult<T = unknown> = {
  data: T
  error: unknown
}

type AuthIdentity = {
  id: string
  email: string | null
}

type AuthSession = {
  access_token: string
  user: AuthIdentity
}

type AuthStateSession = AuthSession & {
  refresh_token: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasValidSession(data: unknown): boolean {
  if (!isRecord(data) || !isRecord(data.session)) {
    return false
  }

  const session = data.session
  if (typeof session.access_token !== 'string' || session.access_token.length === 0 || !isRecord(session.user)) {
    return false
  }

  const { id, email } = session.user
  return typeof id === 'string'
    && id.length > 0
    && (email === undefined || email === null || typeof email === 'string')
}

function hasSessionField(data: unknown): boolean {
  return isRecord(data) && 'session' in data
}

export interface AuthLifecycleEvent {
  event: string
  user: AuthIdentity | null
}

export interface NarrowSupabaseAuthClient {
  auth: {
    signInWithPassword(input: { email: string; password: string }): Promise<ProviderResult>
    signOut(): Promise<ProviderResult>
    getSession(): Promise<ProviderResult<{ session: AuthSession | null }>>
    refreshSession(): Promise<ProviderResult>
    resetPasswordForEmail(email: string, options: { redirectTo?: string }): Promise<ProviderResult>
    verifyOtp(input: { token_hash: string; type: AuthEmailFlow }): Promise<ProviderResult>
    updateUser(input: { password: string }): Promise<ProviderResult>
    onAuthStateChange(listener: (event: string, session: AuthStateSession | null) => void): {
      data: { subscription: { unsubscribe(): void } }
    }
  }
}

export interface SupabaseAuthRepository {
  signIn(input: SignInInput): Promise<void>
  signOut(): Promise<void>
  getAccessToken(): Promise<string | null>
  refreshSession(): Promise<void>
  requestPasswordReset(input: { email: string; redirectTo: string }): Promise<void>
  verifyEmailTokenHash(input: { tokenHash: string; type: AuthEmailFlow }): Promise<void>
  updatePassword(password: string): Promise<void>
  subscribe(listener: (event: AuthLifecycleEvent) => void): () => void
}

class SupabaseAuthRepositoryImpl implements SupabaseAuthRepository {
  constructor(private readonly client: NarrowSupabaseAuthClient) {}

  async signIn(input: SignInInput): Promise<void> {
    await this.runSessionOperation(() => this.client.auth.signInWithPassword(input))
  }

  async signOut(): Promise<void> {
    await this.runVoid(() => this.client.auth.signOut())
  }

  async getAccessToken(): Promise<string | null> {
    try {
      const { data, error } = await this.client.auth.getSession()
      if (error) {
        throw mapSupabaseAuthError(error)
      }

      if (!hasSessionField(data) || (data.session !== null && !hasValidSession(data))) {
        throw this.malformedResponse()
      }

      return typeof data.session?.access_token === 'string' ? data.session.access_token : null
    } catch (error) {
      throw this.toClientError(error)
    }
  }

  async refreshSession(): Promise<void> {
    await this.runSessionOperation(() => this.client.auth.refreshSession())
  }

  async requestPasswordReset(input: { email: string; redirectTo: string }): Promise<void> {
    await this.runVoid(() => this.client.auth.resetPasswordForEmail(input.email, {
      redirectTo: input.redirectTo,
    }))
  }

  async verifyEmailTokenHash(input: { tokenHash: string; type: AuthEmailFlow }): Promise<void> {
    await this.runSessionOperation(() => this.client.auth.verifyOtp({
      token_hash: input.tokenHash,
      type: input.type,
    }))
  }

  async updatePassword(password: string): Promise<void> {
    await this.runVoid(() => this.client.auth.updateUser({ password }))
  }

  subscribe(listener: (event: AuthLifecycleEvent) => void): () => void {
    try {
      const { data } = this.client.auth.onAuthStateChange((event, session) => {
        const user = session?.user
        listener({
          event,
          user: user && typeof user.id === 'string'
            ? { id: user.id, email: typeof user.email === 'string' ? user.email : null }
            : null,
        })
      })

      return () => data.subscription.unsubscribe()
    } catch (error) {
      throw this.toClientError(error)
    }
  }

  private async runVoid(operation: () => Promise<ProviderResult>): Promise<void> {
    try {
      const { error } = await operation()
      if (error) {
        throw mapSupabaseAuthError(error)
      }
    } catch (error) {
      throw this.toClientError(error)
    }
  }

  private async runSessionOperation(operation: () => Promise<ProviderResult>): Promise<void> {
    try {
      const { data, error } = await operation()
      if (error) {
        throw mapSupabaseAuthError(error)
      }
      if (!hasValidSession(data)) {
        throw this.malformedResponse()
      }
    } catch (error) {
      throw this.toClientError(error)
    }
  }

  private malformedResponse(): ClientError {
    return new ClientError({
      kind: 'api',
      code: 'MALFORMED_RESPONSE',
      message: 'Phản hồi từ dịch vụ xác thực không hợp lệ.',
      retryable: false,
    })
  }

  private toClientError(error: unknown): ClientError {
    return error instanceof ClientError ? error : mapSupabaseAuthError(error)
  }
}

export function createSupabaseAuthRepository(client: NarrowSupabaseAuthClient): SupabaseAuthRepository {
  return new SupabaseAuthRepositoryImpl(client)
}
