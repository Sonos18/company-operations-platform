import type { ApiErrorCode } from '../../shared/schemas/api-error'

export type ClientErrorKind =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'network'
  | 'rate_limit'
  | 'api'
  | 'unexpected'

export type ClientOnlyErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_NOT_READY'
  | 'PASSWORD_RESET_FAILED'
  | 'PASSWORD_COMPROMISED'
  | 'PASSWORD_POLICY_REJECTED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'CANONICAL_RELOAD_REQUIRED'

export type ClientErrorCode = ApiErrorCode | ClientOnlyErrorCode
export type ClientErrorReason = 'MODULE_DISABLED'

export interface ClientErrorOptions {
  kind: ClientErrorKind
  code: ClientErrorCode
  message: string
  fieldErrors?: Record<string, string>
  requestId?: string
  reason?: ClientErrorReason
  retryable: boolean
  details?: Record<string, unknown>
}

export class ClientError extends Error {
  readonly kind: ClientErrorKind
  readonly code: ClientErrorCode
  readonly fieldErrors?: Record<string, string>
  readonly requestId?: string
  readonly reason?: ClientErrorReason
  readonly retryable: boolean
  readonly details?: Record<string, unknown>

  constructor(options: ClientErrorOptions) {
    super(options.message)
    this.name = 'ClientError'
    this.kind = options.kind
    this.code = options.code
    this.fieldErrors = options.fieldErrors
    this.requestId = options.requestId
    this.reason = options.reason
    this.retryable = options.retryable
    this.details = options.details
  }
}
