import type { ApiErrorCode } from '../../../shared/schemas/api-error'

export interface RpcErrorMapping {
  status: number
  message: string
}

/**
 * Dedicated HTTP status and user message for cost RPC error codes that need more
 * than the generic workflow mapping. Codes not listed here keep the generic
 * mapping in `workflowResponse` (403/404/400/500/409 by code).
 *
 * Status rules follow the existing codes: input errors are 400 (INPUT_INVALID),
 * missing targets 404 (RESOURCE_NOT_FOUND), actor restrictions 403
 * (SELF_ROLE_CHANGE_FORBIDDEN), state and capacity conflicts 409 (VERSION_CONFLICT).
 */
export const costRpcErrorMappings: Partial<Record<ApiErrorCode, RpcErrorMapping>> = {
  // Material contracts (A4).
  CONTRACT_EXISTS: { status: 409, message: 'Đơn hàng này đã có hợp đồng.' },
  ORDER_NOT_ACTIVE: { status: 409, message: 'Đơn hàng không còn hiệu lực để ghi hợp đồng.' },
  VARIANCE_REASON_REQUIRED: { status: 400, message: 'Giá trị hợp đồng khác giá trị đơn hàng, cần nhập lý do chênh lệch.' },
  CONTRACT_TOTAL_MISMATCH: { status: 400, message: 'Tổng giá trị hợp đồng phải bằng giá trước thuế cộng thuế GTGT.' },
  INSTALLMENT_TOTAL_MISMATCH: { status: 400, message: 'Tổng các đợt thanh toán phải bằng tổng giá trị hợp đồng.' },
  AMENDMENT_BELOW_COMMITTED: { status: 409, message: 'Phụ lục không được thấp hơn số tiền đã chi, đang đề nghị hoặc đã nhận hóa đơn.' },
  // Material invoices (A4).
  INVOICE_TOTAL_EXCEEDED: { status: 409, message: 'Tổng hóa đơn vượt quá giá trị hợp đồng hiện hành.' },
  INVOICE_TOTAL_MISMATCH: { status: 400, message: 'Tổng tiền hóa đơn phải bằng tiền trước thuế cộng thuế GTGT.' },
  INVOICE_DUPLICATE: { status: 409, message: 'Hóa đơn có cùng ký hiệu và số đã được nhập cho nhà cung cấp này.' },
  INVOICE_IN_USE: { status: 409, message: 'Không thể hủy hóa đơn đang gắn với đề nghị thanh toán.' },
  INVOICE_NOT_RECORDED: { status: 409, message: 'Hóa đơn đã bị hủy hoặc không thuộc hợp đồng này.' },
  // Material payment requests and payments (A5).
  INVOICE_REQUIRED: { status: 400, message: 'Đề nghị thanh toán cho đợt không phải tạm ứng phải gắn ít nhất một hóa đơn.' },
  INSTALLMENT_NOT_FOUND: { status: 404, message: 'Không tìm thấy đợt thanh toán trong lịch hiện hành của hợp đồng.' },
  INSTALLMENT_CAPACITY_EXCEEDED: { status: 409, message: 'Số tiền đề nghị vượt quá số còn lại của đợt thanh toán.' },
  SELF_DECISION_FORBIDDEN: { status: 403, message: 'Bạn không thể tự duyệt hoặc tự chi cho đề nghị do chính mình lập.' },
  PROOF_ALREADY_USED: { status: 409, message: 'Chứng từ chuyển khoản này đã được dùng cho một lần chi khác.' },
  EVIDENCE_INVALID: { status: 400, message: 'Tệp chứng từ không hợp lệ hoặc không đúng đối tượng.' },
}
