import { describe, expect, it } from 'vitest'
import { AppApiError, toApiErrorBody } from '../../../server/utils/api-error'

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
})
