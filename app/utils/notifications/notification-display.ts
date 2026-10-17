import type { AppNotificationView } from '../../../shared/schemas/costs/material-finance'

export type NotificationTone = 'warning' | 'success' | 'error' | 'reminder' | 'info'

export interface NotificationBadge {
  label: string
  tone: NotificationTone
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const RELATIVE_DAY_LIMIT = 30

const needsReview: NotificationBadge = { label: 'Cần duyệt', tone: 'warning' }
const approved: NotificationBadge = { label: 'Đã duyệt', tone: 'success' }
const returned: NotificationBadge = { label: 'Bị trả lại', tone: 'error' }
const reminder: NotificationBadge = { label: 'Nhắc hạn', tone: 'reminder' }
const info: NotificationBadge = { label: 'Thông tin', tone: 'info' }

// A Map (not a plain object) so an unknown kind such as "constructor" never resolves to an inherited property.
const materialBadgeByKind = new Map<string, NotificationBadge>([
  ['material.proposal.submitted', needsReview],
  ['material.payment.submitted', needsReview],
  ['material.proposal.approved', approved],
  ['material.payment.approved', approved],
  ['material.payment.paid', approved],
  ['material.proposal.returned', returned],
  ['material.payment.returned', returned],
  ['material.installment.due_soon', reminder],
  ['material.installment.overdue', reminder],
  ['material.order.created', info],
  ['material.contract.recorded', info],
  ['material.contract.amended', info],
])

/** Label and tone for a material notification; unknown kinds fall back to "Thông tin". */
export function materialNotificationBadge(eventKind: AppNotificationView['eventKind'] | string): NotificationBadge {
  return materialBadgeByKind.get(eventKind) ?? info
}

/** Cost approval notifications are only created when the director decides on a request, so they read as approved. */
export const costNotificationBadge: NotificationBadge = { label: 'Đã duyệt', tone: 'success' }

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

/** dd/MM/yyyy of an instant in the user's local timezone. */
function localDateText(date: Date): string {
  return `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${date.getFullYear()}`
}

/** dd/MM/yyyy HH:mm of an instant in the user's local timezone, used as the hover text of a timestamp. */
export function fullDateTimeText(iso: string): string {
  const date = new Date(iso)
  return `${localDateText(date)} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
}

/** Vietnamese relative time such as "5 phút trước", switching to the local date after 30 days. */
export function relativeTimeText(iso: string, now: Date): string {
  const elapsedMs = now.getTime() - new Date(iso).getTime()
  if (elapsedMs < MINUTE_MS) return 'Vừa xong'
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)} phút trước`
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)} giờ trước`
  if (elapsedMs < RELATIVE_DAY_LIMIT * DAY_MS) return `${Math.floor(elapsedMs / DAY_MS)} ngày trước`
  return localDateText(new Date(iso))
}
