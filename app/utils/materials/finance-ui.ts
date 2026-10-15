import { MoneyDecimal } from '../../../shared/utils/money-decimal'
import { ClientError } from '../../errors/client-error'
import { describeContractError } from './contract-errors'
import { createCommandKeyKeeper } from './command-key'
import { parseVnMoney } from './vn-number'

/**
 * Helpers specific to the invoice, payment request and finance inbox UI. Money parsing and
 * display (vn-number), dates (date-display), idempotency keys (command-key) and the shared
 * error texts (contract-errors) live in the T5 utils and are reused, not repeated here.
 */

/** Canonical money string (Vietnamese input format "1.000.000,5" -> "1000000.5") or null when invalid. */
export function parseMoneyOrNull(raw: string): string | null {
  const parsed = parseVnMoney(raw)
  return parsed.ok ? parsed.value : null
}

export function isPositiveMoney(value: string | null): value is string {
  return value !== null && new MoneyDecimal(value).gt(0)
}

export function moneyEquals(left: string, right: string): boolean {
  return new MoneyDecimal(left).equals(new MoneyDecimal(right))
}

export function moneySum(left: string, right: string): string {
  return new MoneyDecimal(left).plus(right).toFixed()
}

export function moneyGreaterThan(left: string, right: string): boolean {
  return new MoneyDecimal(left).gt(new MoneyDecimal(right))
}

const financeErrorMessages: Readonly<Record<string, string>> = {
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
}

export function financeErrorCode(err: unknown): string | undefined {
  return err instanceof ClientError ? err.code : undefined
}

/**
 * Vietnamese message for a failed finance command or read: payment-specific codes first, then
 * the shared contract error texts (VERSION_CONFLICT, PERMISSION_DENIED, ...).
 */
export function financeErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ClientError)) return fallback
  return financeErrorMessages[err.code] ?? describeContractError(err).message
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

/** After a failed command: forget the idempotency key unless the outcome is unknown (then a retry must replay it). */
export type CommandKeyKeeper = ReturnType<typeof createCommandKeyKeeper>

export function resetCommandKeyAfterError(keeper: CommandKeyKeeper, err: unknown): void {
  if (isDefinitiveRejection(err)) keeper.reset()
}

/**
 * One idempotency key keeper per action and target (for example "decide:<requestId>"). The
 * owner of the dialogs holds this, so a key survives closing and reopening a dialog: if a
 * submit timed out after the server committed, the same submit after reopening replays the
 * same key instead of creating a second request.
 */
export function createScopedCommandKeys() {
  const keepers = new Map<string, CommandKeyKeeper>()
  return {
    forScope(scope: string): CommandKeyKeeper {
      let keeper = keepers.get(scope)
      if (!keeper) {
        keeper = createCommandKeyKeeper()
        keepers.set(scope, keeper)
      }
      return keeper
    },
  }
}

/** True when the server rejected the command because the record changed since it was loaded. */
export function isVersionConflict(err: unknown): boolean {
  return financeErrorCode(err) === 'VERSION_CONFLICT'
}
