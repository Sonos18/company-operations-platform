import type { AppNotificationView } from '../../../shared/schemas/costs/material-finance'
import {
  materialSummaryText,
  orderCodeLabel,
  proposalCodeLabel,
  revisionSuffix,
  withProjectName,
  withSupplierName,
} from '../../../shared/utils/material-codes'
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

/** Returns the payload value as a whole number, or null when it is missing or not numeric. */
function integerValue(payload: NotificationPayload, key: string): number | null {
  const value = payload[key]
  const parsed = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value
  return typeof parsed === 'number' && Number.isInteger(parsed) ? parsed : null
}

/**
 * "Eo Gió · ĐH 18-1" for a notification whose payload carries the order code.
 * Notifications stored before the codes existed have no `proposalNo` or `orderSeq`: they return null
 * so the caller keeps the previous wording.
 */
function orderLabel(payload: NotificationPayload): string | null {
  const proposalNo = integerValue(payload, 'proposalNo')
  const orderSeq = integerValue(payload, 'orderSeq')
  if (proposalNo === null || orderSeq === null) return null
  return withProjectName(textValue(payload, 'projectName'), orderCodeLabel(proposalNo, orderSeq))
}

/** "Thép D10 và 2 vật tư khác" from the summary keys of the payload, or "" when there is nothing to list. */
function summaryText(payload: NotificationPayload): string {
  const names = [textValue(payload, 'summaryName1'), textValue(payload, 'summaryName2')]
    .filter((name): name is string => name !== null)
  return materialSummaryText(names, integerValue(payload, 'summaryTotal') ?? names.length)
}

/** " (Thép D10 và 2 vật tư khác)", or "" when the summary is empty. */
function summaryPart(payload: NotificationPayload): string {
  const summary = summaryText(payload)
  return summary ? ` (${summary})` : ''
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

/** "Hợp đồng HD-01 (Eo Gió · ĐH 18-1)"; the order label replaces "Đơn không hợp đồng" for a quotation-only order. */
function contractLabel(payload: NotificationPayload): string {
  const label = orderLabel(payload)
  if (isQuotationOnly(payload)) return label ?? 'Đơn không hợp đồng'
  const contractNo = textValue(payload, 'contractNo')
  const base = contractNo ? `Hợp đồng ${contractNo}` : 'Hợp đồng'
  return label ? `${base} (${label})` : base
}

/** "hợp đồng HD-01 (Eo Gió · ĐH 18-1)" inside a sentence, "đơn không hợp đồng" for a quotation-only order, or "hợp đồng" when the number is missing. */
function requestContractPart(payload: NotificationPayload): string {
  const label = orderLabel(payload)
  if (isQuotationOnly(payload)) return label ?? 'đơn không hợp đồng'
  const contractNo = textValue(payload, 'contractNo')
  const base = contractNo ? `hợp đồng ${contractNo}` : 'hợp đồng'
  return label ? `${base} (${label})` : base
}

function supplierPart(payload: NotificationPayload): string {
  const supplierName = textValue(payload, 'supplierName')
  return supplierName ? ` với ${supplierName}` : ''
}

/** `Đợt "Đợt 2" của Eo Gió · ĐH 18-1 · Hòa Phát`; without the order code it is just `Đợt "Đợt 2"`. */
function installmentLabel(payload: NotificationPayload): string {
  const installmentName = textValue(payload, 'installmentName')
  const base = installmentName ? `Đợt "${installmentName}"` : 'Một đợt thanh toán'
  const label = orderLabel(payload)
  return label ? `${base} của ${withSupplierName(label, textValue(payload, 'supplierName'))}` : base
}

/** Title and body of a proposal notification, named after the project and proposal code when the payload has them. */
function proposalTitle(payload: NotificationPayload, outcome: string): string {
  const proposalNo = integerValue(payload, 'proposalNo')
  const label = proposalNo === null
    ? 'Đơn đề xuất vật tư'
    : withProjectName(textValue(payload, 'projectName'), proposalCodeLabel(proposalNo))
  return `${label} – ${outcome}`
}

function proposalSubject(payload: NotificationPayload): string {
  const proposalNo = integerValue(payload, 'proposalNo')
  return proposalNo === null ? 'đơn đề xuất vật tư' : proposalCodeLabel(proposalNo)
}

/** " Lý do: Sai số lượng." without doubling the full stop when the reason already ends with punctuation. */
function reasonPart(reason: string | null): string {
  if (!reason) return ''
  return ` Lý do: ${reason}${/[.!?]$/.test(reason) ? '' : '.'}`
}

function actorPart(payload: NotificationPayload): string {
  return textValue(payload, 'actorName') ?? 'Một nhân viên'
}

/** Builds the user-facing title and body for a material finance app notification. */
export function appNotificationText(notification: AppNotificationView): AppNotificationText {
  const { payload } = notification

  switch (notification.eventKind) {
    case 'material.proposal.submitted': {
      const resubmitted = (integerValue(payload, 'revisionNo') ?? 1) > 1
      return {
        title: `${proposalTitle(payload, 'Chờ duyệt')}${revisionSuffix(integerValue(payload, 'revisionNo'))}`,
        body: `${actorPart(payload)} vừa gửi${resubmitted ? ' lại' : ''} ${proposalSubject(payload)}${summaryPart(payload)}, cần bạn xem xét duyệt.`,
      }
    }
    case 'material.proposal.approved':
      return {
        title: proposalTitle(payload, 'Đã duyệt'),
        body: `${actorPart(payload)} đã duyệt ${proposalSubject(payload)}${summaryPart(payload)}.`,
      }
    case 'material.proposal.returned': {
      const reason = textValue(payload, 'reason')
      return {
        title: proposalTitle(payload, 'Bị trả lại'),
        body: `${actorPart(payload)} đã trả lại ${proposalSubject(payload)}${summaryPart(payload)}.${reasonPart(reason)}`,
      }
    }
    case 'material.order.created': {
      const supplierName = textValue(payload, 'supplierName')
      const label = orderLabel(payload)
      if (label) {
        return {
          title: 'Đơn mua mới chờ hợp đồng',
          body: `${withSupplierName(label, supplierName)}${summaryPart(payload)} cần ghi nhận hợp đồng.`,
        }
      }
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
      // Notifications stored before the order codes existed keep the previous wording.
      const target = orderLabel(payload) ? ` cho ${requestContractPart(payload)}${supplierPart(payload)}` : ''
      return {
        title: 'Đề nghị chi chờ lập UNC',
        body: amount
          ? `Đề nghị chi trị giá ${amount}${target} đang chờ lập UNC.`
          : 'Có đề nghị chi đang chờ lập UNC.',
      }
    }
    // Returned, approved and paid notifications go to a person by user id, so they never show money.
    case 'material.payment.returned': {
      const reason = textValue(payload, 'reason')
      return {
        title: 'Đề nghị chi bị trả lại',
        body: `Đề nghị chi cho ${requestContractPart(payload)}${supplierPart(payload)} đã bị trả lại.${reasonPart(reason)}`,
      }
    }
    // Goes to the accountant who submitted the request: the treasurer has made the UNC.
    case 'material.payment.approved': {
      return {
        title: 'Đề nghị chi đã lập UNC',
        body: `Đề nghị chi cho ${requestContractPart(payload)}${supplierPart(payload)} đã được xác nhận lập UNC. Vui lòng cập nhật biên lai chuyển khoản sau khi giám đốc duyệt trên ngân hàng.`,
      }
    }
    // Goes to the treasurer who confirmed the UNC: the accountant has recorded the payment.
    case 'material.payment.paid': {
      return {
        title: 'Đề nghị chi đã được chi',
        body: `Đề nghị chi cho ${requestContractPart(payload)}${supplierPart(payload)} đã được kế toán ghi chi.`,
      }
    }
    default:
      return { title: 'Thông báo vật tư', body: '' }
  }
}
