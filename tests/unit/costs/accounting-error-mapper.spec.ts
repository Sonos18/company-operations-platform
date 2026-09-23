import { describe, expect, it } from 'vitest'
import { ClientError } from '../../../app/errors/client-error'
import {
  isVersionConflictError,
  mapAccountingErrorMessage,
  mapPublishBlockerCode,
} from '../../../app/utils/costs/accounting-error-mapper'

describe('accounting-error-mapper', () => {
  it('maps all documented domain error codes to meaningful Vietnamese messages', () => {
    const cases: Array<[string, string]> = [
      ['INPUT_INVALID', 'Dữ liệu nhập vào không hợp lệ'],
      ['PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này'],
      ['COMPANY_FORBIDDEN', 'Bạn không có quyền truy cập công ty này'],
      ['RESOURCE_NOT_FOUND', 'Không tìm thấy dữ liệu yêu cầu'],
      ['VERSION_CONFLICT', 'Dữ liệu đã bị thay đổi bởi người dùng khác'],
      ['IDEMPOTENCY_CONFLICT', 'Yêu cầu bị trùng lặp'],
      ['COST_NOT_DRAFT', 'không còn ở trạng thái nháp'],
      ['COST_ALREADY_PUBLISHED', 'đã được phát hành chính thức'],
      ['SUBCONTRACT_COST_MODEL_UNSUPPORTED', 'Mô hình chi phí thầu phụ không hỗ trợ'],
      ['EVIDENCE_UPLOAD_MISMATCH', 'không khớp'],
      ['FILE_TOO_LARGE', 'vượt quá giới hạn 25 MiB'],
      ['FILE_TYPE_UNSUPPORTED', 'Định dạng tệp không được hỗ trợ'],
      ['HISTORY_IMMUTABLE', 'Lịch sử tài chính là bất biến'],
      ['PAYMENT_ALREADY_VOIDED', 'đã được hủy trước đó'],
    ]

    for (const [code, snippet] of cases) {
      const error = new ClientError({
        kind: 'api',
        code: code as any,
        message: code === 'INPUT_INVALID' ? 'Dữ liệu nhập vào không hợp lệ' : 'Original message',
        retryable: false,
      })
      expect(mapAccountingErrorMessage(error)).toContain(snippet)
    }
  })

  it('translates COST_PUBLISH_NOT_READY with blocker codes', () => {
    const errorWithBlockers = new ClientError({
      kind: 'api',
      code: 'COST_PUBLISH_NOT_READY' as any,
      message: 'Not ready',
      retryable: false,
      details: {
        blockingCodes: ['FINANCIAL_DETAILS_REQUIRED', 'EVIDENCE_NOT_FINALIZED'],
      },
    })
    const msg = mapAccountingErrorMessage(errorWithBlockers)
    expect(msg).toContain('Bản nháp chưa đủ điều kiện phát hành:')
    expect(msg).toContain('Cần có ít nhất một dòng chi tiết tài chính')
    expect(msg).toContain('Có chứng từ đính kèm chưa hoàn tất tải lên hoặc chưa xác nhận')

    const errorWithoutBlockers = new ClientError({
      kind: 'api',
      code: 'COST_PUBLISH_NOT_READY' as any,
      message: 'Not ready',
      retryable: false,
    })
    expect(mapAccountingErrorMessage(errorWithoutBlockers)).toContain('Bản nháp chưa đủ điều kiện phát hành')
  })

  it('translates each of the 5 documented publish blocker codes', () => {
    expect(mapPublishBlockerCode('FINANCIAL_DETAILS_REQUIRED')).toBe('Cần có ít nhất một dòng chi tiết tài chính')
    expect(mapPublishBlockerCode('SOURCE_NOT_SHARED')).toBe('Nguồn số liệu chưa được chia sẻ hoặc không hợp lệ')
    expect(mapPublishBlockerCode('SOURCE_REVIEW_BLOCKING')).toBe('Nguồn số liệu đang có vấn đề cần soát xét chặn phát hành')
    expect(mapPublishBlockerCode('EVIDENCE_NOT_FINALIZED')).toBe('Có chứng từ đính kèm chưa hoàn tất tải lên hoặc chưa xác nhận')
    expect(mapPublishBlockerCode('SUBCONTRACT_COST_MODEL_UNSUPPORTED')).toBe('Mô hình chi phí thầu phụ không hỗ trợ phát hành qua luồng chi phí thông thường')
    expect(mapPublishBlockerCode('UNKNOWN_CODE')).toBe('UNKNOWN_CODE')
  })

  it('detects version conflict errors', () => {
    const versionConflict = new ClientError({
      kind: 'api',
      code: 'VERSION_CONFLICT',
      message: 'Version conflict',
      retryable: false,
    })
    expect(isVersionConflictError(versionConflict)).toBe(true)

    const otherError = new ClientError({
      kind: 'api',
      code: 'INPUT_INVALID',
      message: 'Invalid input',
      retryable: false,
    })
    expect(isVersionConflictError(otherError)).toBe(false)
    expect(isVersionConflictError(new Error('Version conflict'))).toBe(false)
  })

  it('falls back to default message when error is empty or unspecified', () => {
    expect(mapAccountingErrorMessage(null)).toBe('Đã xảy ra lỗi. Vui lòng thử lại.')
    expect(mapAccountingErrorMessage(undefined, 'Tùy chỉnh lỗi')).toBe('Tùy chỉnh lỗi')
  })
})
