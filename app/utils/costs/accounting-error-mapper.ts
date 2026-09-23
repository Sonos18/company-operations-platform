import type { ProjectCostPublishBlockingCode } from '../../../shared/schemas/costs/project-costs'
import type { ClientError } from '../../errors/client-error'

export const PUBLISH_BLOCKING_LABELS: Record<ProjectCostPublishBlockingCode, string> = {
  FINANCIAL_DETAILS_REQUIRED: 'Cần có ít nhất một dòng chi tiết tài chính',
  SOURCE_NOT_SHARED: 'Nguồn số liệu chưa được chia sẻ hoặc không hợp lệ',
  SOURCE_REVIEW_BLOCKING: 'Nguồn số liệu đang có vấn đề cần soát xét chặn phát hành',
  EVIDENCE_NOT_FINALIZED: 'Có chứng từ đính kèm chưa hoàn tất tải lên hoặc chưa xác nhận',
  SUBCONTRACT_COST_MODEL_UNSUPPORTED: 'Mô hình chi phí thầu phụ không hỗ trợ phát hành qua luồng chi phí thông thường',
}

export function translatePublishBlockingCode(code: string): string {
  if (code in PUBLISH_BLOCKING_LABELS) {
    return PUBLISH_BLOCKING_LABELS[code as ProjectCostPublishBlockingCode]
  }
  return code
}

export function extractErrorMessage(err: unknown, fallbackMessage = 'Đã xảy ra lỗi. Vui lòng thử lại.'): string {
  if (!err) return fallbackMessage

  const clientError = err as Partial<ClientError> & {
    details?: Record<string, unknown>
    statusMessage?: string
    message?: string
  }

  const code = clientError.code || clientError.reason

  switch (code) {
    case 'VERSION_CONFLICT':
      return 'Dữ liệu đã bị thay đổi bởi người dùng khác (xung đột phiên bản). Vui lòng làm mới dữ liệu và đối chiếu trước khi lưu.'
    case 'IDEMPOTENCY_CONFLICT':
      return 'Yêu cầu bị trùng lặp với nội dung khác đã được ghi nhận. Vui lòng thử lại với một yêu cầu mới.'
    case 'COST_NOT_DRAFT':
      return 'Bản ghi chi phí này không còn ở trạng thái nháp.'
    case 'COST_ALREADY_PUBLISHED':
      return 'Chi phí này đã được phát hành chính thức, không thể chỉnh sửa như bản nháp.'
    case 'COST_PUBLISH_NOT_READY': {
      const blockingCodes = (clientError.details?.blockingCodes as string[]) || []
      if (blockingCodes.length > 0) {
        const list = blockingCodes.map(c => `• ${translatePublishBlockingCode(c)}`).join('\n')
        return `Bản nháp chưa đủ điều kiện phát hành:\n${list}`
      }
      return 'Bản nháp chưa đủ điều kiện phát hành. Vui lòng hoàn thiện chi tiết tài chính và chứng từ đính kèm.'
    }
    case 'SUBCONTRACT_COST_MODEL_UNSUPPORTED':
      return 'Mô hình chi phí thầu phụ không hỗ trợ thao tác này. Vui lòng sử dụng luồng quản lý thanh toán thầu phụ chuyên biệt.'
    case 'EVIDENCE_UPLOAD_MISMATCH':
      return 'Tệp tải lên không khớp với định dạng hoặc mã băm (SHA-256) đã khai báo. Vui lòng chọn lại tệp và thử lại.'
    case 'FILE_TOO_LARGE':
      return 'Dung lượng tệp vượt quá giới hạn 25 MiB cho phép.'
    case 'FILE_TYPE_UNSUPPORTED':
      return 'Định dạng tệp không được hỗ trợ. Chỉ chấp nhận các định dạng: PDF, XLS, XLSX, PNG, JPEG.'
    case 'HISTORY_IMMUTABLE':
      return 'Lịch sử tài chính là bất biến. Không thể chỉnh sửa trực tiếp dữ liệu đã lưu. Vui lòng sử dụng luồng điều chỉnh hoặc hủy.'
    case 'PAYMENT_ALREADY_VOIDED':
      return 'Khoản thanh toán này đã được hủy trước đó, không thể hủy lại.'
    case 'PERMISSION_DENIED':
      return 'Bạn không có quyền thực hiện thao tác này.'
    case 'COMPANY_FORBIDDEN':
      return 'Bạn không có quyền truy cập công ty này.'
    case 'RESOURCE_NOT_FOUND':
      return 'Không tìm thấy dữ liệu yêu cầu hoặc dữ liệu đã bị xóa.'
    case 'INPUT_INVALID':
      return clientError.message || 'Dữ liệu cung cấp không hợp lệ. Vui lòng kiểm tra lại các trường thông tin.'
    default:
      if (clientError.message && clientError.message !== 'Lỗi kết nối máy chủ') {
        return clientError.message
      }
      return fallbackMessage
  }
}

export function isVersionConflictError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  return (err as { code?: string }).code === 'VERSION_CONFLICT'
}

export const mapAccountingErrorMessage = extractErrorMessage
export const mapPublishBlockerCode = translatePublishBlockingCode

