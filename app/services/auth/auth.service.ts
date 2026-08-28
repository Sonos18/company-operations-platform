import type { z } from 'zod'
import { ClientError } from '../../errors/client-error'
import type { SupabaseAuthRepository, SignInInput } from '../../repositories/auth/supabase-auth.repository'
import type { SessionRepository, SessionResponse } from '../../repositories/http/http-session-repository'
import {
  authCallbackQuerySchema,
  forgotPasswordInputSchema,
  resetPasswordInputSchema,
  signInInputSchema,
} from '../../../shared/schemas/auth'
import { buildAuthCallbackUrl } from '../../../shared/utils/app-url'
import type { RecoveryFlowStorage } from './recovery-flow.storage'

export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>
export type AuthCallbackInput = z.infer<typeof authCallbackQuerySchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>

export interface AuthService {
  restoreAppSession(): Promise<SessionResponse | null>
  signIn(input: SignInInput): Promise<SessionResponse>
  requestPasswordReset(input: ForgotPasswordInput): Promise<void>
  completeEmailCallback(input: AuthCallbackInput): Promise<void>
  completePasswordReset(input: ResetPasswordInput): Promise<SessionResponse>
  refreshAppSession(): Promise<SessionResponse>
  signOut(): Promise<void>
}

export interface AuthServiceOptions {
  authRepository: SupabaseAuthRepository
  sessionRepository: SessionRepository
  recoveryFlow: RecoveryFlowStorage
  appUrl: string
}

function validationError(): ClientError {
  return new ClientError({
    kind: 'validation',
    code: 'VALIDATION_FAILED',
    message: 'Dữ liệu đăng nhập không hợp lệ.',
    retryable: false,
  })
}

function authRequiredError(): ClientError {
  return new ClientError({
    kind: 'authentication',
    code: 'AUTH_REQUIRED',
    message: 'Bạn cần đăng nhập để tiếp tục.',
    retryable: false,
  })
}

function safeError(error: unknown): ClientError {
  return error instanceof ClientError
    ? error
    : new ClientError({
      kind: 'unexpected',
      code: 'INTERNAL_ERROR',
      message: 'Hệ thống gặp lỗi ngoài dự kiến.',
      retryable: false,
    })
}

function parseOrThrow<T>(schema: { safeParse(value: unknown): { success: true, data: T } | { success: false } }, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw validationError()
  return parsed.data
}

class AuthServiceImpl implements AuthService {
  constructor(private readonly options: AuthServiceOptions) {}

  async restoreAppSession(): Promise<SessionResponse | null> {
    const accessToken = await this.options.authRepository.getAccessToken()
    if (!accessToken) return null
    return this.readAppSession()
  }

  async signIn(input: SignInInput): Promise<SessionResponse> {
    const parsed = parseOrThrow(signInInputSchema, input)
    await this.options.authRepository.signIn(parsed)
    return this.readAppSession()
  }

  async requestPasswordReset(input: ForgotPasswordInput): Promise<void> {
    const parsed = parseOrThrow(forgotPasswordInputSchema, input)
    let redirectTo: string
    try {
      redirectTo = buildAuthCallbackUrl(this.options.appUrl)
    }
    catch {
      throw safeError(undefined)
    }

    try {
      await this.options.authRepository.requestPasswordReset({ email: parsed.email, redirectTo })
    }
    catch {
      // A generic completion result prevents account enumeration and avoids provider detail in UI.
    }
  }

  async completeEmailCallback(input: AuthCallbackInput): Promise<void> {
    const parsed = parseOrThrow(authCallbackQuerySchema, input)
    this.options.recoveryFlow.begin(parsed.type)

    try {
      await this.options.authRepository.verifyEmailTokenHash({ tokenHash: parsed.token_hash, type: parsed.type })
    }
    catch (error) {
      this.options.recoveryFlow.clear()
      throw safeError(error)
    }
  }

  async completePasswordReset(input: ResetPasswordInput): Promise<SessionResponse> {
    const parsed = parseOrThrow(resetPasswordInputSchema, input)
    if (!this.options.recoveryFlow.get()) throw authRequiredError()

    const accessToken = await this.options.authRepository.getAccessToken()
    if (!accessToken) throw authRequiredError()

    await this.options.authRepository.updatePassword(parsed.password)
    this.options.recoveryFlow.clear()
    return this.readAppSession()
  }

  async refreshAppSession(): Promise<SessionResponse> {
    return this.readAppSession()
  }

  async signOut(): Promise<void> {
    try {
      await this.options.authRepository.signOut()
    }
    finally {
      this.options.recoveryFlow.clear()
    }
  }

  private async readAppSession(): Promise<SessionResponse> {
    try {
      return await this.options.sessionRepository.get()
    }
    catch (firstError) {
      const safeFirstError = safeError(firstError)
      if (safeFirstError.code !== 'AUTH_INVALID') throw safeFirstError

      await this.options.authRepository.refreshSession()
      try {
        return await this.options.sessionRepository.get()
      }
      catch (retryError) {
        const safeRetryError = safeError(retryError)
        if (safeRetryError.code === 'AUTH_INVALID') {
          try {
            await this.signOut()
          }
          catch {
            // The invalid app session remains the outward failure even when best-effort sign-out fails.
          }
        }
        throw safeRetryError
      }
    }
  }
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  return new AuthServiceImpl(options)
}
