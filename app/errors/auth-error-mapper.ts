import { ClientError, type ClientErrorOptions } from './client-error'

type ProviderError = Record<string, unknown>

const rateLimitCodes = new Set([
  'over_request_rate_limit',
  'over_email_send_rate_limit',
  'over_sms_send_rate_limit',
])

function asProviderError(error: unknown): ProviderError | null {
  return typeof error === 'object' && error !== null ? error as ProviderError : null
}

function providerCode(error: ProviderError | null): string | null {
  return typeof error?.code === 'string' ? error.code : null
}

function hasPwnedPasswordReason(error: ProviderError): boolean {
  return error.reason === 'pwned'
    || (Array.isArray(error.reasons) && error.reasons.includes('pwned'))
}

function isNetworkFailure(error: unknown, providerError: ProviderError | null, code: string | null): boolean {
  if (error instanceof TypeError || code === 'fetch_error' || code === 'network_error') {
    return true
  }

  if (providerError?.name === 'AuthRetryableFetchError') {
    return true
  }

  return error instanceof Error && /(?:fetch|network)/i.test(error.message)
}

function clientError(options: ClientErrorOptions): ClientError {
  return new ClientError(options)
}

export function mapSupabaseAuthError(error: unknown): ClientError {
  const providerError = asProviderError(error)
  const code = providerCode(providerError)

  if (code === 'invalid_credentials') {
    return clientError({
      kind: 'authentication',
      code: 'INVALID_CREDENTIALS',
      message: 'Email hoặc mật khẩu không chính xác.',
      retryable: false,
    })
  }

  if (code === 'email_not_confirmed' || code === 'user_banned') {
    return clientError({
      kind: 'authentication',
      code: 'ACCOUNT_NOT_READY',
      message: 'Tài khoản chưa sẵn sàng để đăng nhập.',
      retryable: false,
    })
  }

  if (code !== null && rateLimitCodes.has(code)) {
    return clientError({
      kind: 'rate_limit',
      code: 'RATE_LIMITED',
      message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.',
      retryable: true,
    })
  }

  if (code === 'weak_password') {
    return clientError({
      kind: 'validation',
      code: providerError !== null && hasPwnedPasswordReason(providerError)
        ? 'PASSWORD_COMPROMISED'
        : 'PASSWORD_POLICY_REJECTED',
      message: providerError !== null && hasPwnedPasswordReason(providerError)
        ? 'Mật khẩu này đã xuất hiện trong một vụ rò rỉ dữ liệu. Vui lòng chọn mật khẩu khác.'
        : 'Mật khẩu chưa đáp ứng yêu cầu bảo mật.',
      retryable: false,
    })
  }

  if (isNetworkFailure(error, providerError, code)) {
    return clientError({
      kind: 'network',
      code: 'NETWORK_ERROR',
      message: 'Không thể kết nối đến dịch vụ xác thực. Vui lòng thử lại.',
      retryable: true,
    })
  }

  return clientError({
    kind: 'unexpected',
    code: 'INTERNAL_ERROR',
    message: 'Hệ thống gặp lỗi ngoài dự kiến.',
    retryable: false,
  })
}
