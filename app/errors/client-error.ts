export type ClientErrorKind =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'network'
  | 'rate_limit'
  | 'api'
  | 'unexpected'

export type ClientErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_NOT_READY'
  | 'PASSWORD_RESET_FAILED'
  | 'PASSWORD_COMPROMISED'
  | 'PASSWORD_POLICY_REJECTED'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'COMPANY_FORBIDDEN'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'INTERNAL_ERROR'

export interface ClientErrorOptions {
  kind: ClientErrorKind
  code: ClientErrorCode
  message: string
  fieldErrors?: Record<string, string>
  requestId?: string
  retryable: boolean
}

export class ClientError extends Error {
  readonly kind: ClientErrorKind
  readonly code: ClientErrorCode
  readonly fieldErrors?: Record<string, string>
  readonly requestId?: string
  readonly retryable: boolean

  constructor(options: ClientErrorOptions) {
    super(options.message)
    this.name = 'ClientError'
    this.kind = options.kind
    this.code = options.code
    this.fieldErrors = options.fieldErrors
    this.requestId = options.requestId
    this.retryable = options.retryable
  }
}
