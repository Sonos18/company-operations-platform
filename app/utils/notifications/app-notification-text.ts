import type { AppNotificationView } from '../../../shared/schemas/costs/material-finance'
import { formatVnNumber } from '../materials/vn-number'

type NotificationPayload = AppNotificationView['payload']

export interface AppNotificationText {
  title: string
  body: string
}

const canonicalDecimalPattern = /^-?\d+(\.\d+)?$/
const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

/** Returns the trimmed payload value as text, or null when it is missing or empty. */
function textValue(payload: NotificationPayload, key: string): string | null {
  const value = payload[key]
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Display-only money formatting with the shared A4/A5 formatter ("1.100.000", "12.500,5").
 * The decimal string is formatted as text, never converted to a JavaScript number.
 */
function moneyValue(payload: NotificationPayload, key: string): string | null {
  const raw = textValue(payload, key)
  if (raw === null || !canonicalDecimalPattern.test(raw)) return null
  return formatVnNumber(raw)
}

/** Converts a YYYY-MM-DD payload value to dd/MM/yyyy by splitting the string, never through Date. */
function dateValue(payload: NotificationPayload, key: string): string | null {
  const match = textValue(payload, key)?.match(isoDatePattern)
  if (!match) return null
  const [, year, month, day] = match
  return `${day}/${month}/${year}`
}

/** An order recorded from a signed quotation only has no contract number to show. */
function isQuotationOnly(payload: NotificationPayload): boolean {
  return textValue(payload, 'documentation') === 'quotation_only'
}

function contractLabel(payload: NotificationPayload): string {
  if (isQuotationOnly(payload)) return 'Đơn không hợp đồng'
  const contractNo = textValue(payload, 'contractNo')
  return contractNo ? `Hợp đồng ${contractNo}` : 'Hợp đồng'
}

/** "hợp đồng HD-01" inside a sentence, "đơn không hợp đồng" for a quotation-only order, or "hợp đồng" when the number is missing. */
function requestContractPart(payload: NotificationPayload): string {
  if (isQuotationOnly(payload)) return 'đơn không hợp đồng'
  const contractNo = textValue(payload, 'contractNo')
  return contractNo ? `hợp đồng ${contractNo}` : 'hợp đồng'
}

function supplierPart(payload: NotificationPayload): string {
  const supplierName = textValue(payload, 'supplierName')
  return supplierName ? ` với ${supplierName}` : ''
}

function installmentLabel(payload: NotificationPayload): string {
  const installmentName = textValue(payload, 'installmentName')
  return installmentName ? `Đợt "${installmentName}"` : 'Một đợt thanh toán'
}

/** Builds the user-facing title and body for a material finance app notification. */
export function appNotificationText(notification: AppNotificationView): AppNotificationText {
  const { payload } = notification

  switch (notification.eventKind) {
    case 'material.order.created': {
      const supplierName = textValue(payload, 'supplierName')
      return {
        title: 'Đơn mua mới chờ hợp đồng',
        body: supplierName
          ? `Đơn mua từ ${supplierName} cần ghi nhận hợp đồng.`
          : 'Có đơn mua mới cần ghi nhận hợp đồng.',
      }
    }
    case 'material.contract.recorded': {
      const total = moneyValue(payload, 'total')
      const totalPart = total ? `, tổng giá trị ${total}` : ''
      return {
        title: isQuotationOnly(payload) ? 'Đơn không hợp đồng đã được ghi nhận' : 'Hợp đồng vật tư đã được ghi nhận',
        body: `${contractLabel(payload)}${supplierPart(payload)}${totalPart}.`,
      }
    }
    case 'material.contract.amended': {
      const versionNo = textValue(payload, 'versionNo')
      const versionPart = versionNo ? ` (bản ${versionNo})` : ''
      return {
        title: 'Hợp đồng có phụ lục mới',
        body: `${contractLabel(payload)} đã có phụ lục mới${versionPart}.`,
      }
    }
    case 'material.installment.due_soon': {
      const dueOn = dateValue(payload, 'dueOn')
      const duePart = dueOn ? ` đến hạn ngày ${dueOn}` : ' sắp đến hạn'
      return {
        title: 'Đợt thanh toán sắp đến hạn',
        body: `${installmentLabel(payload)}${duePart}.`,
      }
    }
    case 'material.installment.overdue': {
      const dueOn = dateValue(payload, 'dueOn')
      const duePart = dueOn ? ` đã quá hạn từ ngày ${dueOn}` : ' đã quá hạn'
      return {
        title: 'Đợt thanh toán quá hạn',
        body: `${installmentLabel(payload)}${duePart}.`,
      }
    }
    case 'material.payment.submitted': {
      const amount = moneyValue(payload, 'amount')
      return {
        title: 'Đề nghị chi chờ duyệt',
        body: amount
          ? `Đề nghị chi trị giá ${amount} đang chờ duyệt.`
          : 'Có đề nghị chi đang chờ duyệt.',
      }
    }
    // Returned and paid notifications go to the submitter by user id, so they never show money.
    case 'material.payment.returned': {
      const reason = textValue(payload, 'reason')
      const reasonPart = reason ? ` Lý do: ${reason}.` : ''
      return {
        title: 'Đề nghị chi bị trả lại',
        body: `Đề nghị chi cho ${requestContractPart(payload)}${supplierPart(payload)} đã bị trả lại.${reasonPart}`,
      }
    }
    case 'material.payment.paid': {
      return {
        title: 'Đề nghị chi đã được chi',
        body: `Đề nghị chi cho ${requestContractPart(payload)}${supplierPart(payload)} đã được thanh toán.`,
      }
    }
    default:
      return { title: 'Thông báo vật tư', body: '' }
  }
}
