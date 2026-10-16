import { describe, expect, it } from 'vitest'
import { approveActionLabel, paymentRequestStateLabel } from '../../../app/utils/materials/payment-request-labels'

describe('paymentRequestStateLabel', () => {
  it('labels the unpaid states by the new flow', () => {
    expect(paymentRequestStateLabel('submitted', [])).toBe('Chờ lập UNC')
    expect(paymentRequestStateLabel('approved', [])).toBe('Đã lập UNC – chờ giám đốc duyệt')
    expect(paymentRequestStateLabel('returned', [])).toBe('Bị trả lại')
    expect(paymentRequestStateLabel('cancelled', [])).toBe('Đã hủy')
  })

  it('labels a paid request by the stage of its linked invoices', () => {
    expect(paymentRequestStateLabel('paid', ['draft'])).toBe('Đã chi – chờ hóa đơn chính thức')
    expect(paymentRequestStateLabel('paid', ['official'])).toBe('Đã chi')
    expect(paymentRequestStateLabel('paid', [])).toBe('Đã chi')
  })

  it('waits for the official invoice while any linked invoice is still a draft', () => {
    expect(paymentRequestStateLabel('paid', ['official', 'draft'])).toBe('Đã chi – chờ hóa đơn chính thức')
    expect(paymentRequestStateLabel('paid', ['official', 'official'])).toBe('Đã chi')
  })

  it('ignores invoice stages on states other than paid', () => {
    expect(paymentRequestStateLabel('submitted', ['draft'])).toBe('Chờ lập UNC')
    expect(paymentRequestStateLabel('approved', ['draft'])).toBe('Đã lập UNC – chờ giám đốc duyệt')
  })
})

describe('approveActionLabel', () => {
  it('names the treasurer action for a bank transfer', () => {
    expect(approveActionLabel(false)).toBe('Xác nhận đã lập UNC')
  })

  it('adds the cash wording when the order may be paid in cash', () => {
    expect(approveActionLabel(true)).toBe('Xác nhận đã lập UNC / đã chi tiền mặt')
    expect(approveActionLabel(true)).toContain('/ đã chi tiền mặt')
  })
})
