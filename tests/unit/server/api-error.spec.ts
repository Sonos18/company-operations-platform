import { createApp, defineEventHandler, setResponseHeader, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import { AppApiError, runApiRoute, toApiErrorBody } from '../../../server/utils/api-error'

describe('toApiErrorBody', () => {
  it('maps an expected error', () => {
    const error = new AppApiError(
      403,
      'COMPANY_FORBIDDEN',
      'Bạn không có quyền truy cập công ty này.',
    )

    expect(toApiErrorBody(error, 'request-id')).toEqual({
      error: {
        code: 'COMPANY_FORBIDDEN',
        message: 'Bạn không có quyền truy cập công ty này.',
        requestId: 'request-id',
        details: {},
      },
    })
  })

  it('does not leak unknown errors', () => {
    expect(toApiErrorBody(new Error('secret'), 'request-id')).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Hệ thống gặp lỗi ngoài dự kiến.',
        requestId: 'request-id',
        details: {},
      },
    })
  })

  it('sends the stable error body and request ID through H3', async () => {
    const requestId = '10000000-0000-4000-8000-000000000001'
    const app = createApp()
    app.use('/protected', defineEventHandler(async (event) => {
      event.context.requestId = requestId
      setResponseHeader(event, 'x-request-id', requestId)

      return runApiRoute(event, async () => {
        throw new AppApiError(
          403,
          'COMPANY_FORBIDDEN',
          'Bạn không có quyền truy cập công ty này.',
        )
      })
    }))

    const response = await toWebHandler(app)(
      new Request('http://localhost/protected'),
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('x-request-id')).toBe(requestId)
    expect(await response.json()).toEqual({
      error: {
        code: 'COMPANY_FORBIDDEN',
        message: 'Bạn không có quyền truy cập công ty này.',
        requestId,
        details: {},
      },
    })
  })
})
