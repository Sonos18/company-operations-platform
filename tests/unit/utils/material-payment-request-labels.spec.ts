import { describe, expect, it } from 'vitest'
import { approveActionLabel, invoiceStagesForRequest, paymentRequestStateLabel } from '../../../app/utils/materials/payment-request-labels'

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

describe('invoiceStagesForRequest', () => {
  it('returns an empty array when the request has no linked invoices', () => {
    expect(invoiceStagesForRequest(null, [])).toEqual([])
    expect(invoiceStagesForRequest(undefined, [])).toEqual([])
    expect(invoiceStagesForRequest({ invoiceIds: [] }, [])).toEqual([])
  })

  it('maps a linked recorded draft invoice to [\'draft\']', () => {
    const request = { invoiceIds: ['inv-1'] }
    const invoices = [{ id: 'inv-1', state: 'recorded', stage: 'draft' as const }]
    expect(invoiceStagesForRequest(request, invoices)).toEqual(['draft'])
  })

  it('ignores voided draft invoices', () => {
    const request = { invoiceIds: ['inv-1'] }
    const invoices = [{ id: 'inv-1', state: 'voided', stage: 'draft' as const }]
    expect(invoiceStagesForRequest(request, invoices)).toEqual([])
  })

  it('maps a linked recorded official invoice to [\'official\']', () => {
    const request = { invoiceIds: ['inv-1'] }
    const invoices = [{ id: 'inv-1', state: 'recorded', stage: 'official' as const }]
    expect(invoiceStagesForRequest(request, invoices)).toEqual(['official'])
  })

  it('defaults missing stage to official for recorded invoices', () => {
    const request = { invoiceIds: ['inv-1'] }
    const invoices = [{ id: 'inv-1', state: 'recorded' }]
    expect(invoiceStagesForRequest(request, invoices)).toEqual(['official'])
  })

  it('collects stages of recorded invoices while ignoring voided ones', () => {
    const request = { invoiceIds: ['inv-1', 'inv-2', 'inv-3'] }
    const invoices = [
      { id: 'inv-1', state: 'recorded', stage: 'official' as const },
      { id: 'inv-2', state: 'voided', stage: 'draft' as const },
      { id: 'inv-3', state: 'recorded', stage: 'draft' as const },
    ]
    expect(invoiceStagesForRequest(request, invoices)).toEqual(['official', 'draft'])
  })
})
