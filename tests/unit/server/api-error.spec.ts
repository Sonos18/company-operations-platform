import { createApp, defineEventHandler, setResponseHeader, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppApiError, runApiRoute, toApiErrorBody } from '../../../server/utils/api-error'
import { apiErrorCodeSchema } from '../../../shared/schemas/api-error'
import { workflowResponse } from '../../../server/features/costs/workflow/cost-workflow.repository'

describe('toApiErrorBody', () => {
  it.each([
    'COST_NOT_DRAFT',
    'COST_ALREADY_PUBLISHED',
    'COST_PUBLISH_NOT_READY',
    'PROJECT_COST_CATEGORY_CONFLICT',
    'HISTORY_IMMUTABLE',
    'COST_DETAIL_NOT_DRAFT',
    'COST_DETAIL_ALREADY_PUBLISHED',
    'COST_DETAIL_PUBLISH_NOT_READY',
    'COST_DETAIL_NOT_PUBLISHED',
    'SUBCONTRACT_COST_MODEL_UNSUPPORTED',
    'EVIDENCE_UPLOAD_MISMATCH',
    'PAYMENT_ALREADY_VOIDED',
  ])('accepts the accounting write error code %s', code => {
    expect(apiErrorCodeSchema.safeParse(code).success).toBe(true)
  })

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

describe('material finance RPC error mapping', () => {
  const materialFinanceCodes = [
    'CONTRACT_EXISTS', 'ORDER_NOT_ACTIVE', 'VARIANCE_REASON_REQUIRED', 'CONTRACT_TOTAL_MISMATCH',
    'INSTALLMENT_TOTAL_MISMATCH', 'AMENDMENT_BELOW_COMMITTED', 'INVOICE_TOTAL_EXCEEDED', 'INVOICE_TOTAL_MISMATCH',
    'INVOICE_DUPLICATE', 'INVOICE_IN_USE', 'INVOICE_NOT_RECORDED', 'INVOICE_REQUIRED', 'INSTALLMENT_NOT_FOUND',
    'INSTALLMENT_CAPACITY_EXCEEDED', 'SELF_DECISION_FORBIDDEN', 'PROOF_ALREADY_USED', 'EVIDENCE_INVALID',
  ] as const

  function rejected(code: string): AppApiError {
    try {
      workflowResponse({ data: null, error: { message: code } }, z.null())
    }
    catch (error) {
      if (error instanceof AppApiError) return error
      throw error
    }
    throw new Error('expected workflowResponse to throw for ' + code)
  }

  it.each(materialFinanceCodes)('accepts and maps %s with a dedicated Vietnamese message', code => {
    expect(apiErrorCodeSchema.safeParse(code).success).toBe(true)
    const error = rejected(code)
    expect(error.code).toBe(code)
    expect(error.message).not.toBe('Không thể xử lý yêu cầu chi phí.')
    expect(error.message.length).toBeGreaterThan(0)
  })

  it.each([
    ['INSTALLMENT_CAPACITY_EXCEEDED', 409],
    ['SELF_DECISION_FORBIDDEN', 403],
    ['CONTRACT_EXISTS', 409],
    ['INSTALLMENT_TOTAL_MISMATCH', 400],
    ['EVIDENCE_INVALID', 400],
    ['INSTALLMENT_NOT_FOUND', 404],
  ] as const)('maps %s to HTTP %i', (code, status) => {
    expect(rejected(code).statusCode).toBe(status)
  })

  it('keeps the existing generic mapping for older workflow codes', () => {
    expect(rejected('VERSION_CONFLICT')).toMatchObject({ statusCode: 409, code: 'VERSION_CONFLICT', message: 'Không thể xử lý yêu cầu chi phí.' })
    expect(rejected('INPUT_INVALID')).toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(rejected('SOMETHING_UNKNOWN')).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
  })
})
