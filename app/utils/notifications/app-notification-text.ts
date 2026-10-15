import type { AppNotificationView } from '../../../shared/schemas/costs/material-finance'

type NotificationPayload = AppNotificationView['payload']

export interface AppNotificationText {
  title: string
  body: string
}

const moneyFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 })
const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

/** Returns the trimmed payload value as text, or null when it is missing or empty. */
function textValue(payload: NotificationPayload, key: string): string | null {
  const value = payload[key]
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Display-only money formatting. Values are never recomputed here. */
function moneyValue(payload: NotificationPayload, key: string): string | null {
  const raw = textValue(payload, key)
  if (raw === null) return null
  const amount = Number(raw)
  return Number.isFinite(amount) ? moneyFormatter.format(amount) : null
}

/** Converts a YYYY-MM-DD payload value to dd/MM/yyyy by splitting the string, never through Date. */
function dateValue(payload: NotificationPayload, key: string): string | null {
  const match = textValue(payload, key)?.match(isoDatePattern)
  if (!match) return null
  const [, year, month, day] = match
  return `${day}/${month}/${year}`
}

function contractLabel(payload: NotificationPayload): string {
  const contractNo = textValue(payload, 'contractNo')
  return contractNo ? `Hợp đồng ${contractNo}` : 'Hợp đồng'
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
      const supplierName = textValue(payload, 'supplierName')
      const total = moneyValue(payload, 'total')
      const supplierPart = supplierName ? ` với ${supplierName}` : ''
      const totalPart = total ? `, tổng giá trị ${total}` : ''
      return {
        title: 'Hợp đồng vật tư đã được ghi nhận',
        body: `${contractLabel(payload)}${supplierPart}${totalPart}.`,
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
    case 'material.payment.returned': {
      const reason = textValue(payload, 'reason')
      return {
        title: 'Đề nghị chi bị trả lại',
        body: reason
          ? `Đề nghị chi đã bị trả lại. Lý do: ${reason}.`
          : 'Đề nghị chi đã bị trả lại.',
      }
    }
    case 'material.payment.paid': {
      const amount = moneyValue(payload, 'amount')
      return {
        title: 'Đề nghị chi đã được chi',
        body: amount ? `Đã chi ${amount}.` : 'Đề nghị chi đã được thanh toán.',
      }
    }
    default:
      return { title: 'Thông báo vật tư', body: '' }
  }
}
