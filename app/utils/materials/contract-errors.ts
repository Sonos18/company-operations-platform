import { ClientError } from '../../errors/client-error'

const contractErrorMessages: Record<string, string> = {
  VARIANCE_REASON_REQUIRED: 'Giá trị trước VAT khác tổng đơn, vui lòng nhập lý do chênh lệch.',
  CONTRACT_TOTAL_MISMATCH: 'Tổng giá trị phải bằng giá trị trước VAT cộng VAT.',
  INSTALLMENT_TOTAL_MISMATCH: 'Tổng các đợt thanh toán phải bằng tổng giá trị hợp đồng.',
  CONTRACT_EXISTS: 'Đơn này đã có hợp đồng. Vui lòng tải lại trang để xem hợp đồng hiện hành.',
  ORDER_NOT_ACTIVE: 'Đơn mua không còn hoạt động nên không thể ghi hợp đồng.',
  AMENDMENT_BELOW_COMMITTED: 'Phụ lục làm một đợt thấp hơn số đã chi hoặc đang đề nghị chi.',
  INVOICE_TOTAL_EXCEEDED: 'Tổng hóa đơn đã nhận vượt giá trị hợp đồng mới.',
  CONTRACT_REQUIRED: 'Đơn từ 5.000.000 đ trở lên bắt buộc có hợp đồng.',
  CASH_PAYMENT_NOT_ALLOWED: 'Chỉ chi tiền mặt cho đơn có cam kết dưới 5.000.000 đ.',
  CONTRACT_AMENDMENT_UNAVAILABLE: 'Đơn không hợp đồng không thể thêm phụ lục.',
  EVIDENCE_INVALID: 'Tệp đính kèm không hợp lệ hoặc chưa tải lên hoàn tất. Vui lòng chọn lại tệp.',
  VERSION_CONFLICT: 'Dữ liệu đã thay đổi, vui lòng tải lại',
  PERMISSION_DENIED: 'Bạn không có quyền thực hiện thao tác này.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu trùng với một thao tác khác có nội dung khác. Vui lòng kiểm tra và thử lại.',
  NETWORK_ERROR: 'Không thể kết nối đến máy chủ. Vui lòng bấm lưu lại để thử tiếp với đúng nội dung này.',
}

/** Maps a server (or schema) error code to a Vietnamese sentence; unknown errors keep their own message. */
export function describeContractError(err: unknown): { code: string | null, message: string } {
  const code = err instanceof ClientError
    ? err.code
    : (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : null)
  const mapped = code ? contractErrorMessages[code] : undefined
  if (mapped) return { code, message: mapped }
  const message = err instanceof Error && err.message ? err.message : 'Không thể hoàn tất thao tác. Vui lòng thử lại.'
  return { code, message }
}
