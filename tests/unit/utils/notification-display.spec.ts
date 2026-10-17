import { describe, expect, it } from 'vitest'
import {
  costNotificationBadge,
  fullDateTimeText,
  materialNotificationBadge,
  readAllCutoff,
  relativeTimeText,
} from '../../../app/utils/notifications/notification-display'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// Relative durations are absolute milliseconds, so these cases do not depend on the machine timezone.
const now = new Date('2026-10-17T10:00:00Z')
const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString()

describe('materialNotificationBadge', () => {
  it.each([
    ['material.proposal.submitted', 'Cần duyệt', 'warning'],
    ['material.payment.submitted', 'Cần duyệt', 'warning'],
    ['material.proposal.approved', 'Đã duyệt', 'success'],
    ['material.payment.approved', 'Cần xử lý', 'action'],
    ['material.payment.paid', 'Đã duyệt', 'success'],
    ['material.proposal.returned', 'Bị trả lại', 'error'],
    ['material.payment.returned', 'Bị trả lại', 'error'],
    ['material.installment.due_soon', 'Nhắc hạn', 'reminder'],
    ['material.installment.overdue', 'Nhắc hạn', 'reminder'],
    ['material.order.created', 'Cần xử lý', 'action'],
    ['material.contract.recorded', 'Thông tin', 'info'],
    ['material.contract.amended', 'Thông tin', 'info'],
  ])('maps %s to %s (%s)', (eventKind, label, tone) => {
    expect(materialNotificationBadge(eventKind)).toEqual({ label, tone })
  })

  it('falls back to Thông tin for an unknown kind', () => {
    expect(materialNotificationBadge('material.unknown')).toEqual({ label: 'Thông tin', tone: 'info' })
  })

  it('does not read inherited object properties for an unknown kind', () => {
    expect(materialNotificationBadge('constructor')).toEqual({ label: 'Thông tin', tone: 'info' })
  })
})

describe('costNotificationBadge', () => {
  it('labels cost approval notifications as Đã duyệt', () => {
    expect(costNotificationBadge).toEqual({ label: 'Đã duyệt', tone: 'success' })
  })
})

describe('relativeTimeText', () => {
  it('shows Vừa xong for less than a minute ago', () => {
    expect(relativeTimeText(ago(30_000), now)).toBe('Vừa xong')
  })

  it('shows Vừa xong for a time in the future', () => {
    expect(relativeTimeText(new Date(now.getTime() + HOUR_MS).toISOString(), now)).toBe('Vừa xong')
  })

  it('shows minutes below one hour', () => {
    expect(relativeTimeText(ago(59 * MINUTE_MS), now)).toBe('59 phút trước')
    expect(relativeTimeText(ago(HOUR_MS), now)).toBe('1 giờ trước')
  })

  it('shows hours below one day', () => {
    expect(relativeTimeText(ago(23 * HOUR_MS + 59 * MINUTE_MS), now)).toBe('23 giờ trước')
    expect(relativeTimeText(ago(DAY_MS), now)).toBe('1 ngày trước')
  })

  it('shows days below thirty days', () => {
    expect(relativeTimeText(ago(29 * DAY_MS), now)).toBe('29 ngày trước')
  })

  it('shows the local calendar date from thirty days on', () => {
    // Noon local time on both sides keeps the 30-day gap exact and the date stable in any timezone.
    const localNow = new Date(2026, 9, 17, 12)
    const thirtyDaysAgo = new Date(2026, 8, 17, 12).toISOString()
    expect(relativeTimeText(thirtyDaysAgo, localNow)).toBe('17/09/2026')
  })
})

describe('fullDateTimeText', () => {
  it('formats the local date and time as dd/MM/yyyy HH:mm', () => {
    expect(fullDateTimeText(new Date(2026, 8, 7, 9, 5).toISOString())).toBe('07/09/2026 09:05')
  })
})

describe('readAllCutoff', () => {
  it('returns the raw microsecond string of the newest item, not a millisecond re-serialisation', () => {
    const newest = '2026-10-17T10:00:00.123456+00:00'
    const items = [
      { createdAt: '2026-10-17T09:59:59.999999+00:00' },
      { createdAt: newest },
      { createdAt: '2026-10-17T09:00:00.500000+00:00' },
    ]
    expect(readAllCutoff(items)).toBe(newest)
    expect(readAllCutoff(items)).not.toBe(new Date(newest).toISOString())
  })

  it('compares instants across offsets', () => {
    const items = [
      { createdAt: '2026-10-17T15:00:00.000001+07:00' },
      { createdAt: '2026-10-17T09:00:00.000002+00:00' },
    ]
    expect(readAllCutoff(items)).toBe('2026-10-17T09:00:00.000002+00:00')
  })

  it('breaks a millisecond tie with the microseconds', () => {
    const items = [
      { createdAt: '2026-10-17T10:00:00.123456+00:00' },
      { createdAt: '2026-10-17T10:00:00.123789+00:00' },
      { createdAt: '2026-10-17T10:00:00.123100+00:00' },
    ]
    expect(readAllCutoff(items)).toBe('2026-10-17T10:00:00.123789+00:00')
  })

  it('returns null for an empty or failed source', () => {
    expect(readAllCutoff([])).toBeNull()
  })
})
