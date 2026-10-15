import { describe, expect, it } from 'vitest'
import { appNotificationText } from '../../../app/utils/notifications/app-notification-text'

const n = (eventKind: string, payload: Record<string, string | number | null>) => ({
  id: '00000000-0000-4000-8000-000000000001', eventKind, projectId: null, linkPath: '/materials',
  payload, createdAt: '2026-10-15T01:00:00+00:00', readAt: null,
}) as never

describe('appNotificationText', () => {
  it('renders every event kind in Vietnamese', () => {
    expect(appNotificationText(n('material.order.created', { supplierName: 'NCC A' })).title).toBe('Đơn mua mới chờ hợp đồng')
    expect(appNotificationText(n('material.contract.recorded', { supplierName: 'NCC A', contractNo: 'HD-01', total: '110.0000' })).body).toContain('HD-01')
    expect(appNotificationText(n('material.contract.amended', { contractNo: 'HD-01', versionNo: 2 })).title).toBe('Hợp đồng có phụ lục mới')
    expect(appNotificationText(n('material.installment.due_soon', { installmentName: 'Tạm ứng', dueOn: '2026-10-17' })).title).toBe('Đợt thanh toán sắp đến hạn')
    expect(appNotificationText(n('material.installment.overdue', { installmentName: 'Tạm ứng', dueOn: '2026-10-10' })).title).toBe('Đợt thanh toán quá hạn')
    expect(appNotificationText(n('material.payment.submitted', { amount: '33.0000' })).title).toBe('Đề nghị chi chờ duyệt')
    expect(appNotificationText(n('material.payment.returned', { reason: 'Sai số tiền' })).body).toContain('Sai số tiền')
    expect(appNotificationText(n('material.payment.paid', { amount: '33.0000' })).title).toBe('Đề nghị chi đã được chi')
  })
  it('formats money without trailing zeros and dates as dd/MM/yyyy', () => {
    expect(appNotificationText(n('material.contract.recorded', { supplierName: 'NCC A', contractNo: 'HD-01', total: '1100000.0000' })).body).toContain('1.100.000')
    expect(appNotificationText(n('material.installment.overdue', { installmentName: 'Đợt 1', dueOn: '2026-10-10' })).body).toContain('10/10/2026')
  })
  it('never renders "undefined" or "null" when payload keys are missing, null or malformed', () => {
    const eventKinds = [
      'material.order.created',
      'material.contract.recorded',
      'material.contract.amended',
      'material.installment.due_soon',
      'material.installment.overdue',
      'material.payment.submitted',
      'material.payment.returned',
      'material.payment.paid',
    ]
    const payloads = [
      {},
      { supplierName: null, contractNo: null, total: null, versionNo: null, installmentName: null, dueOn: null, amount: null, reason: null },
      { supplierName: '  ', contractNo: '', total: 'not-a-number', dueOn: '17/10/2026', amount: 'abc', reason: '' },
    ]
    for (const eventKind of eventKinds) {
      for (const payload of payloads) {
        const text = appNotificationText(n(eventKind, payload))
        expect(`${text.title} ${text.body}`).not.toMatch(/undefined|null/)
      }
    }
  })
})
