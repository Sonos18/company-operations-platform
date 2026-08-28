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
    await this.runVoid(() => this.client.auth.signInWithPassword(input))
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

      return typeof data.session?.access_token === 'string' ? data.session.access_token : null
    } catch (error) {
      throw this.toClientError(error)
    }
  }

  async refreshSession(): Promise<void> {
    await this.runVoid(() => this.client.auth.refreshSession())
  }

  async requestPasswordReset(input: { email: string; redirectTo: string }): Promise<void> {
    await this.runVoid(() => this.client.auth.resetPasswordForEmail(input.email, {
      redirectTo: input.redirectTo,
    }))
  }

  async verifyEmailTokenHash(input: { tokenHash: string; type: AuthEmailFlow }): Promise<void> {
    await this.runVoid(() => this.client.auth.verifyOtp({
      token_hash: input.tokenHash,
      type: input.type,
    }))
  }

  async updatePassword(password: string): Promise<void> {
    await this.runVoid(() => this.client.auth.updateUser({ password }))
  }

  subscribe(listener: (event: AuthLifecycleEvent) => void): () => void {
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

  private toClientError(error: unknown): ClientError {
    return error instanceof ClientError ? error : mapSupabaseAuthError(error)
  }
}

export function createSupabaseAuthRepository(client: NarrowSupabaseAuthClient): SupabaseAuthRepository {
  return new SupabaseAuthRepositoryImpl(client)
}
