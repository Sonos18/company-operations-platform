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
    expect(appNotificationText(n('material.payment.submitted', { amount: '33.0000' })).title).toBe('Đề nghị chi chờ lập UNC')
    expect(appNotificationText(n('material.payment.returned', { reason: 'Sai số tiền' })).body).toContain('Sai số tiền')
    expect(appNotificationText(n('material.payment.paid', { amount: '33.0000' })).title).toBe('Đề nghị chi đã được chi')
    expect(appNotificationText(n('material.payment.approved', {})).title).toBe('Đề nghị chi đã lập UNC')
  })
  it('tells the accountant a payment request is approved without any amount', () => {
    const approved = appNotificationText(n('material.payment.approved', { supplierName: 'NCC A', contractNo: 'HD-01', documentation: 'contract', amount: '33.0000' }))
    expect(approved.title).not.toBe('Thông báo vật tư')
    expect(approved.body).toContain('HD-01')
    expect(approved.body).toContain('NCC A')
    expect(approved.body).toContain('biên lai chuyển khoản')
    expect(approved.body).toContain('sau khi giám đốc duyệt trên ngân hàng')
    expect(approved.body).not.toMatch(/33/)
    const quotationOnly = appNotificationText(n('material.payment.approved', { supplierName: 'NCC A', contractNo: null, documentation: 'quotation_only' }))
    expect(quotationOnly.body).toContain('đơn không hợp đồng')
    expect(appNotificationText(n('material.payment.approved', {})).body).not.toMatch(/undefined|null/)
  })
  it('uses the new flow wording for submitted and paid notifications', () => {
    expect(appNotificationText(n('material.payment.submitted', { amount: '33.0000' })).title).toBe('Đề nghị chi chờ lập UNC')
    expect(appNotificationText(n('material.payment.submitted', { amount: '33.0000' })).body).toContain('chờ lập UNC')
    expect(appNotificationText(n('material.payment.submitted', {})).body).toContain('chờ lập UNC')
    expect(appNotificationText(n('material.payment.paid', { supplierName: 'NCC A', contractNo: 'HD-01' })).body).toContain('ghi chi')
  })
  it('names a quotation-only order instead of a contract number', () => {
    const payload = { documentation: 'quotation_only', contractNo: null, supplierName: 'NCC A', total: '4500000.0000' }
    const recorded = appNotificationText(n('material.contract.recorded', payload))
    expect(recorded.body).toContain('Đơn không hợp đồng')
    expect(recorded.body).not.toContain('Hợp đồng')
    expect(appNotificationText(n('material.payment.paid', payload)).body).toContain('đơn không hợp đồng')
    expect(appNotificationText(n('material.payment.returned', payload)).body).toContain('đơn không hợp đồng')
  })
  it('formats money without trailing zeros and dates as dd/MM/yyyy', () => {
    expect(appNotificationText(n('material.contract.recorded', { supplierName: 'NCC A', contractNo: 'HD-01', total: '1100000.0000' })).body).toContain('1.100.000')
    expect(appNotificationText(n('material.payment.submitted', { amount: '1234567.5000' })).body).toContain('1.234.567,5')
    expect(appNotificationText(n('material.installment.overdue', { installmentName: 'Đợt 1', dueOn: '2026-10-10' })).body).toContain('10/10/2026')
  })
  it('formats money exactly from the decimal string, without floating point rounding', () => {
    expect(appNotificationText(n('material.payment.submitted', { amount: '12345678901234.1234' })).body).toContain('12.345.678.901.234,1234')
  })
  it('renders returned and paid notifications with supplier and contract but never an amount', () => {
    const returned = appNotificationText(n('material.payment.returned', { supplierName: 'NCC A', contractNo: 'HD-01', reason: 'Sai số tiền', amount: '33.0000' }))
    expect(returned.body).toContain('HD-01')
    expect(returned.body).toContain('NCC A')
    expect(returned.body).toContain('Sai số tiền')
    expect(returned.body).not.toMatch(/33/)
    const paid = appNotificationText(n('material.payment.paid', { supplierName: 'NCC A', contractNo: 'HD-01', amount: '33.0000' }))
    expect(paid.body).toContain('HD-01')
    expect(paid.body).toContain('NCC A')
    expect(paid.body).not.toMatch(/33/)
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
      'material.payment.approved',
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
  describe('proposal notifications', () => {
    const proposal = {
      projectName: 'Eo Gió', proposalNo: 18, revisionNo: 1, actorName: 'Nguyễn Văn A',
      summaryName1: 'Thép D10', summaryName2: 'Xi măng PCB40', summaryTotal: 5,
    }
    it('tells approvers a proposal is waiting for review', () => {
      expect(appNotificationText(n('material.proposal.submitted', proposal))).toEqual({
        title: 'Eo Gió · Đơn 18 – Chờ duyệt',
        body: 'Nguyễn Văn A vừa gửi Đơn 18 (Thép D10, Xi măng PCB40 và 3 vật tư khác), cần bạn xem xét duyệt.',
      })
    })
    it('marks a resubmitted proposal with the revision number', () => {
      const text = appNotificationText(n('material.proposal.submitted', { ...proposal, revisionNo: 2 }))
      expect(text.title).toBe('Eo Gió · Đơn 18 – Chờ duyệt (lần 2)')
      expect(text.body).toBe('Nguyễn Văn A vừa gửi lại Đơn 18 (Thép D10, Xi măng PCB40 và 3 vật tư khác), cần bạn xem xét duyệt.')
    })
    it('tells the submitter the proposal is approved', () => {
      expect(appNotificationText(n('material.proposal.approved', { ...proposal, actorName: 'Trần Thị B' }))).toEqual({
        title: 'Eo Gió · Đơn 18 – Đã duyệt',
        body: 'Trần Thị B đã duyệt Đơn 18 (Thép D10, Xi măng PCB40 và 3 vật tư khác).',
      })
    })
    it('tells the submitter the proposal is returned with the reason', () => {
      expect(appNotificationText(n('material.proposal.returned', { ...proposal, actorName: 'Trần Thị B', reason: 'Sai số lượng' }))).toEqual({
        title: 'Eo Gió · Đơn 18 – Bị trả lại',
        body: 'Trần Thị B đã trả lại Đơn 18 (Thép D10, Xi măng PCB40 và 3 vật tư khác). Lý do: Sai số lượng.',
      })
    })
    it('lists one or two materials without the "others" part when the total matches', () => {
      expect(appNotificationText(n('material.proposal.approved', { ...proposal, summaryName2: null, summaryTotal: 1 })).body)
        .toBe('Nguyễn Văn A đã duyệt Đơn 18 (Thép D10).')
      expect(appNotificationText(n('material.proposal.approved', { ...proposal, summaryTotal: 2 })).body)
        .toBe('Nguyễn Văn A đã duyệt Đơn 18 (Thép D10, Xi măng PCB40).')
    })
    it('omits the parenthesis when the proposal has no lines', () => {
      const empty = { ...proposal, summaryName1: null, summaryName2: null, summaryTotal: 0 }
      expect(appNotificationText(n('material.proposal.submitted', empty)).body)
        .toBe('Nguyễn Văn A vừa gửi Đơn 18, cần bạn xem xét duyệt.')
      expect(appNotificationText(n('material.proposal.returned', { ...empty, reason: 'Thiếu' })).body)
        .toBe('Nguyễn Văn A đã trả lại Đơn 18. Lý do: Thiếu.')
    })
    it('keeps the proposal code when the project name is missing', () => {
      expect(appNotificationText(n('material.proposal.approved', { ...proposal, projectName: null })).title).toBe('Đơn 18 – Đã duyệt')
    })
    it('falls back to a generic text when the proposal number is missing', () => {
      for (const eventKind of ['material.proposal.submitted', 'material.proposal.approved', 'material.proposal.returned']) {
        for (const payload of [{}, { proposalNo: null, actorName: null, reason: null, summaryName1: null, summaryTotal: null }]) {
          const text = appNotificationText(n(eventKind, payload))
          expect(text.title).not.toBe('Thông báo vật tư')
          expect(text.title).not.toBe('')
          expect(text.body).not.toBe('')
          expect(`${text.title} ${text.body}`).not.toMatch(/undefined|null|NaN/)
        }
      }
      expect(appNotificationText(n('material.proposal.submitted', { actorName: 'Nguyễn Văn A' }))).toEqual({
        title: 'Đơn đề xuất vật tư – Chờ duyệt',
        body: 'Nguyễn Văn A vừa gửi đơn đề xuất vật tư, cần bạn xem xét duyệt.',
      })
    })
  })

  describe('order labels in finance notifications', () => {
    const order = { projectName: 'Eo Gió', proposalNo: 18, orderSeq: 1, supplierName: 'Hòa Phát' }
    it('puts the label next to the contract number', () => {
      expect(appNotificationText(n('material.contract.recorded', { ...order, contractNo: 'HD-01', documentation: 'contract', total: '1100000.0000' })).body)
        .toBe('Hợp đồng HD-01 (Eo Gió · ĐH 18-1) với Hòa Phát, tổng giá trị 1.100.000.')
      expect(appNotificationText(n('material.contract.amended', { ...order, contractNo: 'HD-01', versionNo: 2 })).body)
        .toBe('Hợp đồng HD-01 (Eo Gió · ĐH 18-1) đã có phụ lục mới (bản 2).')
    })
    it('replaces "Đơn không hợp đồng" with the label for a quotation-only order', () => {
      const text = appNotificationText(n('material.contract.recorded', { ...order, contractNo: null, documentation: 'quotation_only', total: '4500000.0000' }))
      expect(text.title).toBe('Đơn không hợp đồng đã được ghi nhận')
      expect(text.body).toBe('Eo Gió · ĐH 18-1 với Hòa Phát, tổng giá trị 4.500.000.')
      expect(appNotificationText(n('material.payment.returned', { ...order, contractNo: null, documentation: 'quotation_only', reason: 'Sai số tiền' })).body)
        .toBe('Đề nghị chi cho Eo Gió · ĐH 18-1 với Hòa Phát đã bị trả lại. Lý do: Sai số tiền.')
    })
    it('labels payment request notifications', () => {
      const payload = { ...order, contractNo: 'HD-01', documentation: 'contract' }
      expect(appNotificationText(n('material.payment.returned', { ...payload, reason: 'Sai số tiền' })).body)
        .toBe('Đề nghị chi cho hợp đồng HD-01 (Eo Gió · ĐH 18-1) với Hòa Phát đã bị trả lại. Lý do: Sai số tiền.')
      expect(appNotificationText(n('material.payment.approved', payload)).body)
        .toContain('Đề nghị chi cho hợp đồng HD-01 (Eo Gió · ĐH 18-1) với Hòa Phát đã được xác nhận lập UNC.')
      expect(appNotificationText(n('material.payment.paid', payload)).body)
        .toBe('Đề nghị chi cho hợp đồng HD-01 (Eo Gió · ĐH 18-1) với Hòa Phát đã được kế toán ghi chi.')
    })
    it('says which order an installment belongs to', () => {
      expect(appNotificationText(n('material.installment.due_soon', { ...order, installmentName: 'Đợt 2', dueOn: '2026-10-17' })).body)
        .toBe('Đợt "Đợt 2" của Eo Gió · ĐH 18-1 · Hòa Phát đến hạn ngày 17/10/2026.')
      expect(appNotificationText(n('material.installment.overdue', { ...order, installmentName: 'Đợt 2', dueOn: '2026-10-10' })).body)
        .toBe('Đợt "Đợt 2" của Eo Gió · ĐH 18-1 · Hòa Phát đã quá hạn từ ngày 10/10/2026.')
    })
    it('adds the label and material summary to a new order notification', () => {
      expect(appNotificationText(n('material.order.created', { ...order, summaryName1: 'Thép D10', summaryName2: null, summaryTotal: 3 })))
        .toEqual({
          title: 'Đơn mua mới chờ hợp đồng',
          body: 'Eo Gió · ĐH 18-1 · Hòa Phát (Thép D10 và 2 vật tư khác) cần ghi nhận hợp đồng.',
        })
      expect(appNotificationText(n('material.order.created', { ...order, summaryName1: null, summaryName2: null, summaryTotal: 0 })).body)
        .toBe('Eo Gió · ĐH 18-1 · Hòa Phát cần ghi nhận hợp đồng.')
    })
    it('keeps the order code when the project or supplier name is missing', () => {
      expect(appNotificationText(n('material.installment.due_soon', { proposalNo: 18, orderSeq: 1, installmentName: 'Đợt 2', dueOn: '2026-10-17' })).body)
        .toBe('Đợt "Đợt 2" của ĐH 18-1 đến hạn ngày 17/10/2026.')
    })
    it('accepts the order code as numeric strings', () => {
      expect(appNotificationText(n('material.installment.due_soon', { proposalNo: '18', orderSeq: '1', installmentName: 'Đợt 2', dueOn: '2026-10-17' })).body)
        .toBe('Đợt "Đợt 2" của ĐH 18-1 đến hạn ngày 17/10/2026.')
    })
    it('keeps the previous text when the order code is missing from the payload', () => {
      expect(appNotificationText(n('material.contract.recorded', { projectName: 'Eo Gió', supplierName: 'Hòa Phát', contractNo: 'HD-01', total: '1100000.0000' })).body)
        .toBe('Hợp đồng HD-01 với Hòa Phát, tổng giá trị 1.100.000.')
      expect(appNotificationText(n('material.contract.recorded', { proposalNo: 18, supplierName: 'Hòa Phát', contractNo: 'HD-01' })).body)
        .toBe('Hợp đồng HD-01 với Hòa Phát.')
      expect(appNotificationText(n('material.installment.due_soon', { projectName: 'Eo Gió', orderSeq: 1, installmentName: 'Đợt 2', dueOn: '2026-10-17' })).body)
        .toBe('Đợt "Đợt 2" đến hạn ngày 17/10/2026.')
      expect(appNotificationText(n('material.order.created', { projectName: 'Eo Gió', supplierName: 'Hòa Phát', summaryName1: 'Thép D10', summaryTotal: 1 })).body)
        .toBe('Đơn mua từ Hòa Phát cần ghi nhận hợp đồng.')
    })
  })
})
