import { describe, expect, it } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import { mapSupabaseAuthError } from '../../../app/errors/auth-error-mapper'

describe('mapSupabaseAuthError', () => {
  it.each([
    [{ code: 'invalid_credentials', message: 'provider password detail' }, 'INVALID_CREDENTIALS', 'authentication', false],
    [{ code: 'over_request_rate_limit', message: 'provider rate detail' }, 'RATE_LIMITED', 'rate_limit', true],
    [{ code: 'weak_password', reasons: ['pwned'], message: 'provider pwned detail' }, 'PASSWORD_COMPROMISED', 'validation', false],
    [{ code: 'weak_password', reasons: ['min_length'], message: 'provider policy detail' }, 'PASSWORD_POLICY_REJECTED', 'validation', false],
    [new TypeError('fetch failed with provider detail'), 'NETWORK_ERROR', 'network', true],
    [{ code: 'unexpected_failure', message: 'provider stack and body' }, 'INTERNAL_ERROR', 'unexpected', false],
  ] as const)('maps provider failures to stable safe client errors', (providerError, code, kind, retryable) => {
    const error = mapSupabaseAuthError(providerError)

    expect(error).toBeInstanceOf(ClientError)
    expect(error).toMatchObject({ code, kind, retryable })
    expect(error.message).not.toContain('provider')
    expect(error).not.toHaveProperty('cause')
  })
})

describe('ClientError', () => {
  it('keeps a Nitro request ID without retaining the provider error', () => {
    const error = new ClientError({
      kind: 'api',
      code: 'AUTH_INVALID',
      message: 'Phiên đăng nhập không còn hợp lệ.',
      requestId: 'request-123',
      retryable: true,
    })

    expect(error).toMatchObject({
      kind: 'api',
      code: 'AUTH_INVALID',
      message: 'Phiên đăng nhập không còn hợp lệ.',
      requestId: 'request-123',
      retryable: true,
    })
    expect(error).not.toHaveProperty('cause')
  })
})
