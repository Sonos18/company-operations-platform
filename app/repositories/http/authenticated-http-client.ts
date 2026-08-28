import type { z } from 'zod'
import { ClientError, type ClientErrorCode, type ClientErrorKind } from '../../errors/client-error'
import { apiErrorBodySchema } from '../../../shared/schemas/api-error'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface AuthenticatedHttpClient {
  request<T>(input: {
    url: string
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    schema: z.ZodType<T>
    body?: unknown
  }): Promise<T>
}

export interface AuthenticatedHttpClientOptions {
  getAccessToken: () => string | null | Promise<string | null>
  fetch?: FetchLike
}

const encodedUnsafePathCharacter = /%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i
const maximumPathDecodingPasses = 4
const strictApiErrorBodySchema = apiErrorBodySchema.extend({
  error: apiErrorBodySchema.shape.error.strict(),
}).strict()

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
}

function clientError(
  kind: ClientErrorKind,
  code: ClientErrorCode,
  message: string,
  retryable: boolean,
  requestId?: string,
): ClientError {
  return new ClientError({ kind, code, message, retryable, requestId })
}

function malformedResponse(): ClientError {
  return clientError(
    'unexpected',
    'MALFORMED_RESPONSE',
    'Máy chủ trả về phản hồi không hợp lệ.',
    false,
  )
}

function decodeApiPath(pathname: string): string | null {
  let decodedPathname = pathname

  for (let pass = 0; pass < maximumPathDecodingPasses; pass += 1) {
    let nextPathname: string
    try {
      nextPathname = decodeURIComponent(decodedPathname)
    }
    catch {
      return null
    }

    if (nextPathname === decodedPathname) {
      return hasControlCharacter(decodedPathname)
        || decodedPathname.includes('\\')
        || decodedPathname.startsWith('/api//')
        ? null
        : decodedPathname
    }
    decodedPathname = nextPathname
  }

  return null
}

function isCanonicalInternalApiPath(pathname: string): boolean {
  const decodedPathname = decodeApiPath(pathname)
  return decodedPathname !== null
    && decodedPathname.startsWith('/api/')
    && !decodedPathname.split('/').some(segment => segment === '.' || segment === '..')
}

function isInternalApiUrl(value: string): boolean {
  if (!value.startsWith('/api/')
    || value.startsWith('/api//')
    || value.includes('\\')
    || hasControlCharacter(value)
    || encodedUnsafePathCharacter.test(value)) {
    return false
  }

  const queryOrFragmentIndex = value.search(/[?#]/)
  const rawPathname = queryOrFragmentIndex === -1 ? value : value.slice(0, queryOrFragmentIndex)

  let url: URL
  try {
    url = new URL(value, 'https://taskovia.internal')
  }
  catch {
    return false
  }

  return url.origin === 'https://taskovia.internal'
    && isCanonicalInternalApiPath(rawPathname)
    && url.pathname.startsWith('/api/')
}

function apiFailure(status: number, code: string, requestId: string): ClientError {
  if (status === 429) {
    return clientError(
      'rate_limit',
      'RATE_LIMITED',
      'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.',
      true,
      requestId,
    )
  }

  if (status >= 500) {
    return clientError('api', 'INTERNAL_ERROR', 'Hệ thống không thể xử lý yêu cầu. Vui lòng thử lại sau.', true, requestId)
  }

  if (code === 'AUTH_REQUIRED') {
    return clientError('authentication', 'AUTH_REQUIRED', 'Bạn cần đăng nhập để tiếp tục.', false, requestId)
  }
  if (code === 'AUTH_INVALID') {
    return clientError('authentication', 'AUTH_INVALID', 'Phiên đăng nhập không còn hợp lệ.', true, requestId)
  }
  if (code === 'COMPANY_FORBIDDEN') {
    return clientError('authorization', 'COMPANY_FORBIDDEN', 'Bạn không có quyền truy cập công ty này.', false, requestId)
  }
  if (code === 'PERMISSION_DENIED') {
    return clientError('authorization', 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.', false, requestId)
  }

  if (status === 401) {
    return clientError('authentication', 'AUTH_REQUIRED', 'Bạn cần đăng nhập để tiếp tục.', false, requestId)
  }
  if (status === 403) {
    return clientError('authorization', 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.', false, requestId)
  }

  return clientError('api', 'INTERNAL_ERROR', 'Hệ thống không thể xử lý yêu cầu. Vui lòng thử lại sau.', false, requestId)
}

export function createAuthenticatedHttpClient(options: AuthenticatedHttpClientOptions): AuthenticatedHttpClient {
  const transport = options.fetch ?? globalThis.fetch

  return {
    async request<T>(input: {
      url: string
      method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
      schema: z.ZodType<T>
      body?: unknown
    }): Promise<T> {
      if (!isInternalApiUrl(input.url)) {
        throw clientError('unexpected', 'INTERNAL_ERROR', 'Yêu cầu không hợp lệ.', false)
      }

      let accessToken: string | null
      try {
        accessToken = await options.getAccessToken()
      }
      catch {
        throw clientError('authentication', 'AUTH_REQUIRED', 'Bạn cần đăng nhập để tiếp tục.', false)
      }
      if (typeof accessToken !== 'string' || !accessToken.trim()) {
        throw clientError('authentication', 'AUTH_REQUIRED', 'Bạn cần đăng nhập để tiếp tục.', false)
      }

      const hasBody = input.body !== undefined
      let body: string | undefined
      if (hasBody) {
        try {
          body = JSON.stringify(input.body)
        }
        catch {
          throw clientError('unexpected', 'INTERNAL_ERROR', 'Yêu cầu không hợp lệ.', false)
        }
      }

      let response: Response
      try {
        response = await transport(input.url, {
          method: input.method ?? 'GET',
          headers: hasBody
            ? { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            : { Authorization: `Bearer ${accessToken}` },
          ...(hasBody ? { body } : {}),
        })
      }
      catch {
        throw clientError('network', 'NETWORK_ERROR', 'Không thể kết nối đến máy chủ. Vui lòng thử lại.', true)
      }

      let responseBody: unknown
      try {
        responseBody = await response.json()
      }
      catch {
        throw malformedResponse()
      }

      if (!response.ok) {
        const parsedError = strictApiErrorBodySchema.safeParse(responseBody)
        if (!parsedError.success) throw malformedResponse()
        throw apiFailure(response.status, parsedError.data.error.code, parsedError.data.error.requestId)
      }

      const parsedSuccess = input.schema.safeParse(responseBody)
      if (!parsedSuccess.success) throw malformedResponse()
      return parsedSuccess.data
    },
  }
}
