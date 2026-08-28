import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ClientError } from '../../../app/errors/client-error'
import { createAuthenticatedHttpClient } from '../../../app/repositories/http/authenticated-http-client'

const valueSchema = z.object({ value: z.number() }).strict()

function apiErrorResponse(code: string, requestId = 'request-123') {
  return new Response(JSON.stringify({
    error: {
      code,
      message: 'raw Nitro implementation detail',
      requestId,
      details: { internal: 'never expose this' },
    },
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('authenticated HTTP client', () => {
  it('resolves the current access token immediately before each request', async () => {
    const tokens = ['first-token', 'second-token']
    const getAccessToken = vi.fn(() => tokens.shift() ?? null)
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = createAuthenticatedHttpClient({
      getAccessToken,
      fetch: async (url, init) => {
        calls.push({ url, init })
        return new Response(JSON.stringify({ value: calls.length }), { status: 200 })
      },
    })

    await expect(client.request({ url: '/api/auth/session', schema: valueSchema })).resolves.toEqual({ value: 1 })
    await expect(client.request({ url: '/api/auth/session', schema: valueSchema })).resolves.toEqual({ value: 2 })

    expect(getAccessToken).toHaveBeenCalledTimes(2)
    expect(calls.map(call => call.init?.headers)).toEqual([
      { Authorization: 'Bearer first-token' },
      { Authorization: 'Bearer second-token' },
    ])
  })

  it('rejects a missing access token without calling transport', async () => {
    const fetch = vi.fn()
    const client = createAuthenticatedHttpClient({ getAccessToken: () => null, fetch })

    await expect(client.request({ url: '/api/auth/session', schema: valueSchema }))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED', kind: 'authentication', retryable: false })

    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    'https://outside.example/api/auth/session',
    '//outside.example/api/auth/session',
    '/api\\outside.example/auth/session',
    '/api/auth/session\nX-Forwarded-Host: outside.example',
    '/api/%2f%2foutside.example/auth/session',
    '/api/%5coutside.example/auth/session',
    '/api/%2e/auth/session',
    '/api/%252e/auth/session',
    '/api/%2e%2e/outside.example/auth/session',
    '/api/%252e%252e%252foutside.example/auth/session',
    '/api/%252e%252e%255coutside.example/auth/session',
    '/api/projects/%252e%252e%252fauth/session',
  ])('fails closed before token lookup for unsafe URL %s', async url => {
    const getAccessToken = vi.fn(() => 'never-leak-this-token')
    const fetch = vi.fn()
    const client = createAuthenticatedHttpClient({ getAccessToken, fetch })

    await expect(client.request({ url, schema: valueSchema }))
      .rejects.toMatchObject({ code: 'INTERNAL_ERROR' })

    expect(getAccessToken).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves a valid internal API query string', async () => {
    const calls: string[] = []
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'token',
      fetch: async url => {
        calls.push(url)
        return new Response(JSON.stringify({ value: 1 }), { status: 200 })
      },
    })

    await expect(client.request({ url: '/api/tasks?status=open&sort=updatedAt', schema: valueSchema }))
      .resolves.toEqual({ value: 1 })

    expect(calls).toEqual(['/api/tasks?status=open&sort=updatedAt'])
  })

  it('sends only an exact bearer header and JSON body when a body is provided', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'access-token',
      fetch: async (url, init) => {
        calls.push({ url, init })
        return new Response(JSON.stringify({ value: 1 }), { status: 201 })
      },
    })

    await expect(client.request({
      url: '/api/tasks',
      method: 'POST',
      body: { state: 'open' },
      schema: valueSchema,
    })).resolves.toEqual({ value: 1 })

    expect(calls).toEqual([{
      url: '/api/tasks',
      init: {
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        },
        body: '{"state":"open"}',
      },
    }])
  })

  it.each([
    { status: 401, code: 'AUTH_REQUIRED', expected: 'AUTH_REQUIRED', kind: 'authentication', retryable: false },
    { status: 401, code: 'AUTH_INVALID', expected: 'AUTH_INVALID', kind: 'authentication', retryable: true },
    { status: 403, code: 'COMPANY_FORBIDDEN', expected: 'COMPANY_FORBIDDEN', kind: 'authorization', retryable: false },
    { status: 403, code: 'PERMISSION_DENIED', expected: 'PERMISSION_DENIED', kind: 'authorization', retryable: false },
    { status: 429, code: 'INTERNAL_ERROR', expected: 'RATE_LIMITED', kind: 'rate_limit', retryable: true },
    { status: 500, code: 'INTERNAL_ERROR', expected: 'INTERNAL_ERROR', kind: 'api', retryable: true },
  ])('maps $status responses to a stable $expected error without server details', async ({ status, code, expected, kind, retryable }) => {
    const response = apiErrorResponse(code, 'nitro-request-id')
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'token',
      fetch: async () => new Response(response.body, { status, headers: response.headers }),
    })

    const error = await client.request({ url: '/api/auth/session', schema: valueSchema }).catch(error => error)

    expect(error).toBeInstanceOf(ClientError)
    expect(error).toMatchObject({ code: expected, kind, retryable, requestId: 'nitro-request-id' })
    expect((error as Error).message).not.toContain('raw Nitro')
    expect(JSON.stringify(error)).not.toContain('never expose')
  })

  it('rejects malformed JSON, error envelopes, and successful bodies as safe malformed responses', async () => {
    const responses = [
      new Response('not JSON at all', { status: 200 }),
      new Response(JSON.stringify({ error: { code: 'AUTH_REQUIRED' } }), { status: 401 }),
      new Response(JSON.stringify({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'raw detail',
          requestId: 'request-456',
          details: {},
          unsafeExtra: 'do-not-accept',
        },
      }), { status: 401 }),
      new Response(JSON.stringify({ value: 'not-a-number' }), { status: 200 }),
    ]
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'token',
      fetch: async () => responses.shift()!,
    })

    for (let index = 0; index < 4; index += 1) {
      const error = await client.request({ url: '/api/auth/session', schema: valueSchema }).catch(error => error)
      expect(error).toBeInstanceOf(ClientError)
      expect(error).toMatchObject({ code: 'MALFORMED_RESPONSE', kind: 'unexpected', retryable: false })
    }
  })

  it('maps a transport failure to a safe retryable network error', async () => {
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'token',
      fetch: async () => { throw new TypeError('transport raw credential detail') },
    })

    const error = await client.request({ url: '/api/auth/session', schema: valueSchema }).catch(error => error)

    expect(error).toBeInstanceOf(ClientError)
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', kind: 'network', retryable: true })
    expect((error as Error).message).not.toContain('credential')
  })

  it.each(['COMPANY_FORBIDDEN', 'PERMISSION_DENIED'] as const)(
    'revalidates once for %s, never retries the mutation, and preserves the original error',
    async code => {
      const response = apiErrorResponse(code, 'authorization-request-id')
      const transport = vi.fn(async () => new Response(response.body, { status: 403, headers: response.headers }))
      const onAuthorizationError = vi.fn(async () => {})
      const client = createAuthenticatedHttpClient({
        getAccessToken: () => 'token',
        fetch: transport,
        onAuthorizationError,
      })

      const failure = await client.request({
        url: '/api/tasks',
        method: 'POST',
        body: { state: 'closed' },
        schema: valueSchema,
      }).catch(error => error)

      expect(failure).toMatchObject({ code, requestId: 'authorization-request-id' })
      expect(transport).toHaveBeenCalledTimes(1)
      expect(onAuthorizationError).toHaveBeenCalledTimes(1)
      expect(onAuthorizationError).toHaveBeenCalledWith(failure)
    },
  )

  it('rethrows the original authorization error when revalidation itself fails', async () => {
    const response = apiErrorResponse('PERMISSION_DENIED', 'original-request-id')
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'token',
      fetch: async () => new Response(response.body, { status: 403, headers: response.headers }),
      onAuthorizationError: async () => { throw new Error('refresh failure must not replace the request error') },
    })

    await expect(client.request({ url: '/api/tasks', schema: valueSchema })).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      requestId: 'original-request-id',
    })
  })
})
