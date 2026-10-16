import { describe, expect, it } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import { describeContractError } from '../../../app/utils/materials/contract-errors'

describe('describeContractError', () => {
  it.each([
    ['VARIANCE_REASON_REQUIRED', 'lý do chênh lệch'],
    ['INSTALLMENT_TOTAL_MISMATCH', 'Tổng các đợt'],
    ['CONTRACT_EXISTS', 'đã có hợp đồng'],
    ['ORDER_NOT_ACTIVE', 'không còn hoạt động'],
    ['AMENDMENT_BELOW_COMMITTED', 'thấp hơn số đã chi'],
    ['INVOICE_TOTAL_EXCEEDED', 'hóa đơn'],
    ['EVIDENCE_INVALID', 'Tệp đính kèm'],
    ['VERSION_CONFLICT', 'Dữ liệu đã thay đổi, vui lòng tải lại'],
    ['CONTRACT_REQUIRED', 'bắt buộc có hợp đồng'],
    ['CASH_PAYMENT_NOT_ALLOWED', 'tiền mặt'],
    ['CONTRACT_AMENDMENT_UNAVAILABLE', 'không thể thêm phụ lục'],
  ])('maps the %s code of a ClientError to Vietnamese', (code, fragment) => {
    const error = new ClientError({ kind: 'api', code: code as never, message: 'generic', retryable: false })
    const described = describeContractError(error)
    expect(described.code).toBe(code)
    expect(described.message).toContain(fragment)
  })

  it('maps plain objects that carry a code (schema issues)', () => {
    expect(describeContractError({ code: 'CONTRACT_TOTAL_MISMATCH' }).message).toContain('trước VAT cộng VAT')
  })

  it('keeps the message of unknown errors and falls back for non-errors', () => {
    expect(describeContractError(new Error('Boom'))).toEqual({ code: null, message: 'Boom' })
    expect(describeContractError(undefined).message).toContain('Vui lòng thử lại')
  })
})
