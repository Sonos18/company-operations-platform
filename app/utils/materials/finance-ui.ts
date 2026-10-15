import Decimal from 'decimal.js'
import { ClientError } from '../../errors/client-error'
import { workflowMoneySchema } from '../../../shared/schemas/costs/cost-workflow'
import { formatFinanceMoney } from '../costs/finance-display'
import type {
  MaterialEvidenceIntentInput,
  MaterialEvidenceRole,
} from '../../../shared/schemas/costs/material-procurement'

/**
 * Presentation and command helpers shared by the material invoice, payment request
 * and finance inbox UI. Money is always handled as decimal strings.
 */

const moneyInputPattern = /^\d+(?:\.\d{1,4})?$/

/** Canonical money string (no trailing zeros) or null when the input is not a valid amount. */
export function parseMoneyInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (!moneyInputPattern.test(trimmed)) return null
  const canonical = new Decimal(trimmed).toFixed(4).replace(/\.?0+$/, '')
  const normalized = canonical === '' ? '0' : canonical
  return workflowMoneySchema.safeParse(normalized).success ? normalized : null
}

export function isPositiveMoney(value: string | null): value is string {
  return value !== null && new Decimal(value).gt(0)
}

export function moneyEquals(left: string, right: string): boolean {
  return new Decimal(left).equals(new Decimal(right))
}

export function moneySum(left: string, right: string): string {
  return new Decimal(left).plus(right).toFixed(4).replace(/\.?0+$/, '') || '0'
}

export function moneyGreaterThan(left: string, right: string): boolean {
  return new Decimal(left).gt(new Decimal(right))
}

export function formatMoney(value: string | null | undefined): string {
  return formatFinanceMoney(value ?? '0', undefined, 4) ?? '0'
}

/** dd/mm/yyyy for a date-only or ISO value, without a timezone shift of date-only values. */
export function formatDate(value: string): string {
  if (!value) return ''
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function formatDateTime(value: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const errorMessages: Readonly<Record<string, string>> = {
  INSTALLMENT_CAPACITY_EXCEEDED: 'Số tiền đề nghị vượt quá hạn mức còn lại của đợt thanh toán.',
  INVOICE_REQUIRED: 'Đợt không phải tạm ứng cần ít nhất một hóa đơn đã ghi nhận.',
  SELF_DECISION_FORBIDDEN: 'Bạn là người lập đề nghị này nên không được tự duyệt, trả lại hoặc ghi chi.',
  PROOF_ALREADY_USED: 'Tệp ủy nhiệm chi này đã được dùng cho một lần chi khác. Hãy chọn tệp khác.',
  INVOICE_IN_USE: 'Hóa đơn đang gắn với một đề nghị chi nên chưa thể hủy.',
  INSTALLMENT_NOT_FOUND: 'Không tìm thấy đợt thanh toán này trong hợp đồng.',
  INVOICE_TOTAL_EXCEEDED: 'Tổng giá trị hóa đơn đã vượt tổng giá trị hợp đồng.',
  INVOICE_DUPLICATE: 'Hóa đơn với ký hiệu và số này đã được ghi nhận cho nhà cung cấp.',
  INVOICE_TOTAL_MISMATCH: 'Tổng tiền hóa đơn phải bằng giá trị trước VAT cộng VAT.',
  INVOICE_NOT_RECORDED: 'Có hóa đơn đã bị hủy hoặc chưa được ghi nhận. Hãy tải lại và chọn lại hóa đơn.',
  VERSION_CONFLICT: 'Dữ liệu đã được người khác thay đổi. Hãy tải lại rồi thử lại.',
  IDEMPOTENCY_CONFLICT: 'Thao tác này đã được gửi với nội dung khác. Hãy tải lại rồi thử lại.',
}

export function financeErrorCode(err: unknown): string | undefined {
  if (err instanceof ClientError) return err.code
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : undefined
}

/** Vietnamese message for a failed finance command or read. */
export function financeErrorMessage(err: unknown, fallback: string): string {
  const code = financeErrorCode(err)
  const mapped = code ? errorMessages[code] : undefined
  if (mapped) return mapped
  if (err instanceof ClientError && err.message) return err.message
  return fallback
}

/**
 * Message for a failed evidence upload. The uploader throws plain Vietnamese sentences
 * (unsupported type, storage failure); schema or internal errors are not shown raw.
 */
export function uploadErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ClientError) return financeErrorMessage(err, fallback)
  if (err instanceof Error && err.name !== 'ZodError' && /\s/.test(err.message)) return err.message
  return fallback
}

/**
 * True when the server definitively refused the command, so the same idempotency key
 * must not be reused. Network failures, 5xx and unreadable responses leave the outcome
 * unknown: the next attempt must replay the same key.
 */
export function isDefinitiveRejection(err: unknown): boolean {
  return err instanceof ClientError && !err.retryable && err.kind !== 'unexpected'
}

export interface CommandKeyTracker {
  /** Same key while the payload is unchanged; a new key as soon as it changes. */
  keyFor(payload: unknown): string
  /** Forget the key after success or a definitive rejection. */
  settle(): void
  /** Forget the key unless the error leaves the outcome unknown. */
  settleAfterError(err: unknown): void
}

export function createCommandKeyTracker(): CommandKeyTracker {
  let key: string | null = null
  let fingerprint = ''
  return {
    keyFor(payload) {
      const next = JSON.stringify(payload)
      if (key === null || next !== fingerprint) {
        key = crypto.randomUUID()
        fingerprint = next
      }
      return key
    },
    settle() {
      key = null
      fingerprint = ''
    },
    settleAfterError(err) {
      if (isDefinitiveRejection(err)) {
        key = null
        fingerprint = ''
      }
    },
  }
}

/** Template ref callback that moves focus into a freshly opened dialog. */
export function focusDialogElement(element: unknown): void {
  if (element instanceof HTMLElement) element.focus()
}

interface EvidenceScope {
  evidenceRole: MaterialEvidenceRole
  target: MaterialEvidenceIntentInput['target']
}

/**
 * Role and target of a contract-level evidence file (invoice, payment proof).
 *
 * Task 4 widens `MaterialEvidenceRole` and the evidence target union with these values; the
 * cast keeps this branch compiling until it merges and can be dropped then. The intent
 * schema and the server validate the real values either way.
 */
export function contractEvidenceScope(role: 'invoice' | 'payment_proof', contractId: string): EvidenceScope {
  return { evidenceRole: role, target: { kind: 'material_contract', contractId } } as unknown as EvidenceScope
}
