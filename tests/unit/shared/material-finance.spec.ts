import { describe, expect, it } from 'vitest'
import {
  amendMaterialContractInputSchema,
  appNotificationEventKindSchema,
  materialFinanceInboxSchema,
  projectMaterialFinanceSummarySchema,
  decidePaymentRequestInputSchema,
  materialContractViewSchema,
  materialPaymentRequestViewSchema,
  recordMaterialContractInputSchema,
  materialInvoiceViewSchema,
  officializeMaterialInvoiceInputSchema,
  recordMaterialInvoiceInputSchema,
  recordMaterialPaymentInputSchema,
} from '../../../shared/schemas/costs/material-finance'

const key1 = '00000000-0000-4000-8000-000000000001'
const key2 = '00000000-0000-4000-8000-000000000002'
const file = '00000000-0000-4000-8000-0000000000f1'
const valid = {
  documentation: 'contract' as const,
  expectedOrderVersion: 1,
  contractNo: 'HD-01/2026',
  signedOn: '2026-10-10',
  subtotal: '100.0000',
  vatAmount: '10.0000',
  total: '110.0000',
  varianceReason: null,
  contractFileId: file,
  signedQuotationFileId: '00000000-0000-4000-8000-0000000000f2',
  installments: [
    { installmentKey: key1, name: 'Tạm ứng', amount: '33.0000', dueOn: '2026-10-12', isAdvance: true },
    { installmentKey: key2, name: 'Sau giao hàng', amount: '77.0000', dueOn: '2026-11-10', isAdvance: false },
  ],
}

describe('material finance input schemas', () => {
  it('accepts a balanced contract', () => {
    expect(recordMaterialContractInputSchema.parse(valid)).toMatchObject({ total: '110.0000' })
  })
  it('rejects subtotal + vat != total', () => {
    expect(recordMaterialContractInputSchema.safeParse({ ...valid, total: '111.0000' }).success).toBe(false)
  })
  it('rejects installments that do not sum to total (INSTALLMENT_TOTAL_MISMATCH)', () => {
    const result = recordMaterialContractInputSchema.safeParse({
      ...valid,
      installments: [valid.installments[0], { ...valid.installments[1], amount: '76.9900' }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('INSTALLMENT_TOTAL_MISMATCH')
  })
  it('rejects duplicate installment keys', () => {
    expect(recordMaterialContractInputSchema.safeParse({
      ...valid,
      installments: [valid.installments[0], { ...valid.installments[1], installmentKey: key1 }],
    }).success).toBe(false)
  })
  it('requires amendment reason and file', () => {
    expect(amendMaterialContractInputSchema.safeParse({
      expectedVersion: 1, subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000',
      varianceReason: null, amendmentFileId: file, reason: '', installments: valid.installments,
    }).success).toBe(false)
  })
  it('requires a reason when returning a payment request', () => {
    expect(decidePaymentRequestInputSchema.safeParse({ expectedVersion: 1, decision: 'return' }).success).toBe(false)
    expect(decidePaymentRequestInputSchema.safeParse({ expectedVersion: 1, decision: 'approve' }).success).toBe(true)
  })
  it('rejects a reason on an approval, matching the database', () => {
    expect(decidePaymentRequestInputSchema.safeParse({ expectedVersion: 1, decision: 'approve', reason: 'Đồng ý' }).success).toBe(false)
    expect(decidePaymentRequestInputSchema.safeParse({ expectedVersion: 1, decision: 'return', reason: 'Thiếu chứng từ' }).success).toBe(true)
  })
  it('rejects invoice with duplicate proposal lines', () => {
    expect(recordMaterialInvoiceInputSchema.safeParse({
      invoiceSymbol: '1C26TAA', invoiceNo: '0000123', issuedOn: '2026-10-11',
      subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000', fileId: file,
      lines: [
        { proposalLineId: key1, invoiceMaterialName: 'Thép D10' },
        { proposalLineId: key1, invoiceMaterialName: 'Thép D10 khác' },
      ],
    }).success).toBe(false)
  })

  describe('documentation union', () => {
    const quotationOnly = {
      documentation: 'quotation_only' as const,
      expectedOrderVersion: 1,
      signedOn: '2026-10-10',
      subtotal: '4500000.0000',
      varianceReason: null,
      signedQuotationFileId: '00000000-0000-4000-8000-0000000000f2',
    }
    it('accepts both branches', () => {
      expect(recordMaterialContractInputSchema.parse(valid)).toMatchObject({ documentation: 'contract' })
      expect(recordMaterialContractInputSchema.parse(quotationOnly)).toMatchObject({ documentation: 'quotation_only' })
    })
    it('reads a payload without the documentation key as a contract', () => {
      const { documentation: _documentation, ...legacy } = valid
      expect(recordMaterialContractInputSchema.parse(legacy)).toMatchObject({ documentation: 'contract', contractNo: valid.contractNo })
    })
    it('still validates the contract branch when the documentation key is missing', () => {
      const { documentation: _documentation, ...legacy } = valid
      expect(recordMaterialContractInputSchema.safeParse({ ...legacy, total: '111.0000' }).success).toBe(false)
    })
    it('does not turn a quotation_only body without its key into a valid record', () => {
      const { documentation: _documentation, ...withoutKey } = quotationOnly
      expect(recordMaterialContractInputSchema.safeParse(withoutKey).success).toBe(false)
    })
    it.each(['contractNo', 'contractFileId', 'installments'] as const)('rejects quotation_only carrying %s', key => {
      expect(recordMaterialContractInputSchema.safeParse({ ...quotationOnly, [key]: valid[key] }).success).toBe(false)
    })
    it('requires a positive subtotal on quotation_only', () => {
      expect(recordMaterialContractInputSchema.safeParse({ ...quotationOnly, subtotal: '0.0000' }).success).toBe(false)
    })
  })

  describe('payment method', () => {
    const base = { expectedVersion: 2, paidOn: '2026-10-12', proofFileId: file }
    it('reads a payload without the method key as a bank transfer', () => {
      expect(recordMaterialPaymentInputSchema.parse({ ...base, bankReference: ' UNC-1 ' }))
        .toMatchObject({ method: 'bank_transfer', bankReference: 'UNC-1' })
      expect(recordMaterialPaymentInputSchema.safeParse({ ...base, bankReference: null }).success).toBe(false)
    })
    it('normalizes a blank cash reference to null', () => {
      expect(recordMaterialPaymentInputSchema.parse({ ...base, method: 'cash', bankReference: '  ' }))
        .toMatchObject({ method: 'cash', bankReference: null })
      expect(recordMaterialPaymentInputSchema.parse({ ...base, method: 'cash', bankReference: null }))
        .toMatchObject({ bankReference: null })
    })
    it('rejects a cash payment that carries a reference', () => {
      expect(recordMaterialPaymentInputSchema.safeParse({ ...base, method: 'cash', bankReference: 'UNC-1' }).success).toBe(false)
    })
    it('requires 1 to 100 characters for a bank transfer', () => {
      expect(recordMaterialPaymentInputSchema.safeParse({ ...base, method: 'bank_transfer', bankReference: null }).success).toBe(false)
      expect(recordMaterialPaymentInputSchema.safeParse({ ...base, method: 'bank_transfer', bankReference: '  ' }).success).toBe(false)
      expect(recordMaterialPaymentInputSchema.safeParse({ ...base, method: 'bank_transfer', bankReference: 'x'.repeat(101) }).success).toBe(false)
      expect(recordMaterialPaymentInputSchema.parse({ ...base, method: 'bank_transfer', bankReference: ' UNC-1 ' }).bankReference).toBe('UNC-1')
    })
  })

  describe('quotation-only VAT (C2)', () => {
    const quotationOnly = {
      documentation: 'quotation_only' as const,
      expectedOrderVersion: 1,
      signedOn: '2026-10-10',
      subtotal: '4500000.0000',
      varianceReason: null,
      signedQuotationFileId: '00000000-0000-4000-8000-0000000000f2',
    }
    it('parses without vatAmount and total', () => {
      const parsed = recordMaterialContractInputSchema.parse(quotationOnly)
      expect(parsed).toMatchObject({ documentation: 'quotation_only', subtotal: '4500000.0000' })
      expect(parsed).not.toHaveProperty('vatAmount')
    })
    it('accepts a balanced vatAmount and total', () => {
      expect(recordMaterialContractInputSchema.parse({ ...quotationOnly, vatAmount: '300000.0000', total: '4800000.0000' }))
        .toMatchObject({ vatAmount: '300000.0000', total: '4800000.0000' })
    })
    it('accepts a vatAmount without total (the server completes it)', () => {
      expect(recordMaterialContractInputSchema.safeParse({ ...quotationOnly, vatAmount: '300000' }).success).toBe(true)
    })
    it('rejects a total that does not equal subtotal + vatAmount', () => {
      const result = recordMaterialContractInputSchema.safeParse({ ...quotationOnly, vatAmount: '300000', total: '4900000' })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe('CONTRACT_TOTAL_MISMATCH')
    })
    it('rejects a total without vatAmount that differs from the subtotal', () => {
      expect(recordMaterialContractInputSchema.safeParse({ ...quotationOnly, total: '4900000' }).success).toBe(false)
    })
    it('still rejects contract number, contract file and installments', () => {
      expect(recordMaterialContractInputSchema.safeParse({ ...quotationOnly, contractNo: 'HD-1' }).success).toBe(false)
      expect(recordMaterialContractInputSchema.safeParse({ ...quotationOnly, contractFileId: file }).success).toBe(false)
      expect(recordMaterialContractInputSchema.safeParse({ ...quotationOnly, installments: valid.installments }).success).toBe(false)
    })
  })

  describe('draft and official invoices (C3)', () => {
    const invoice = {
      invoiceSymbol: '1C26TAA', invoiceNo: '0000001', issuedOn: '2026-10-10',
      subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000', fileId: file, lines: [],
    }
    it('defaults the stage of a recorded invoice to official', () => {
      expect(recordMaterialInvoiceInputSchema.parse(invoice).stage).toBe('official')
      expect(recordMaterialInvoiceInputSchema.parse({ ...invoice, stage: 'draft' }).stage).toBe('draft')
      expect(recordMaterialInvoiceInputSchema.safeParse({ ...invoice, stage: 'final' }).success).toBe(false)
    })
    it('parses an invoice view without stage as official with no official file', () => {
      const view = materialInvoiceViewSchema.parse({
        id: key1, contractId: key2, ...invoice, state: 'recorded', voidReason: null, version: 1,
      })
      expect(view).toMatchObject({ stage: 'official', officialFileId: null, officializedAt: null })
    })
    it('parses a draft invoice that was made official', () => {
      const view = materialInvoiceViewSchema.parse({
        id: key1, contractId: key2, ...invoice, state: 'recorded', voidReason: null, version: 2,
        stage: 'official', officialFileId: key2, officializedAt: '2026-10-12T01:00:00+00:00',
      })
      expect(view).toMatchObject({ stage: 'official', officialFileId: key2 })
    })
    it('officializes with exactly expectedVersion and officialFileId', () => {
      expect(officializeMaterialInvoiceInputSchema.parse({ expectedVersion: 1, officialFileId: file }))
        .toEqual({ expectedVersion: 1, officialFileId: file })
      expect(officializeMaterialInvoiceInputSchema.safeParse({ expectedVersion: 1 }).success).toBe(false)
      expect(officializeMaterialInvoiceInputSchema.safeParse({ expectedVersion: 1, officialFileId: file, extra: 1 }).success).toBe(false)
    })
  })

  describe('views read from a database that may predate the migration', () => {
    const request = {
      id: key1, contractId: key2, installmentKey: key1, amount: '10.0000', note: null, state: 'paid', revisionNo: 1,
      submittedBy: key1, submittedAt: '2026-10-10T01:00:00+00:00', invoiceIds: [], cancelReason: null, version: 3, decisions: [],
      payment: { id: key1, paidOn: '2026-10-12', bankReference: 'UNC-1', proofFileId: file, paidBy: key1, recordedAt: '2026-10-12T01:00:00+00:00' },
    }
    const contract = {
      id: key1, orderId: key2, projectId: key1, projectName: 'Eo Gió', proposalNo: 18, orderSeq: 1,
      supplierId: key2, supplierName: 'NCC A', currencyCode: 'VND',
      contractNo: 'HD-01', signedOn: '2026-10-10', currentVersionNo: 1, version: 1,
      versions: [{
        versionNo: 1, kind: 'original', subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000',
        orderSubtotalSnapshot: '100.0000', varianceReason: null, contractFileId: file, signedQuotationFileId: null,
        reason: null, recordedBy: key1, recordedAt: '2026-10-10T01:00:00+00:00',
      }],
      installments: [{
        installmentKey: key1, name: 'Thanh toán 100%', amount: '110.0000', dueOn: '2026-10-10', isAdvance: false,
        seq: 1, paid: '0.0000', pending: '0.0000', remaining: '110.0000', dueStatus: 'not_due',
      }],
      totals: {
        committed: '110.0000', paid: '0.0000', pending: '0.0000', remaining: '110.0000',
        overdue: '0.0000', invoiced: '0.0000', draftInvoiced: '0.0000', paidWithoutInvoice: '0.0000',
      },
    }
    it('defaults a missing documentation to contract and a missing method to bank_transfer', () => {
      expect(materialContractViewSchema.parse(contract).documentation).toBe('contract')
      expect(materialPaymentRequestViewSchema.parse(request).payment?.method).toBe('bank_transfer')
    })
    it('parses a quotation-only contract without number or contract file', () => {
      const view = materialContractViewSchema.parse({
        ...contract, documentation: 'quotation_only', contractNo: null,
        versions: [{ ...contract.versions[0], contractFileId: null }],
      })
      expect(view).toMatchObject({ documentation: 'quotation_only', contractNo: null })
      expect(view.versions[0]?.contractFileId).toBeNull()
    })
    it('requires the project name, proposal number and order sequence on a contract view', () => {
      expect(materialContractViewSchema.parse(contract)).toMatchObject({ projectName: 'Eo Gió', proposalNo: 18, orderSeq: 1 })
      for (const key of ['projectName', 'proposalNo', 'orderSeq'] as const) {
        const { [key]: _removed, ...rest } = contract
        expect(materialContractViewSchema.safeParse(rest).success).toBe(false)
      }
      expect(materialContractViewSchema.safeParse({ ...contract, orderSeq: 0 }).success).toBe(false)
    })
    it('requires the order code keys on summary rows and inbox rows', () => {
      const row = {
        contractId: key1, projectId: key1, projectName: 'Eo Gió', proposalNo: 18, orderSeq: 1, orderId: key2,
        supplierId: key2, supplierName: 'NCC A', documentation: 'contract', contractNo: 'HD-01', totals: contract.totals,
      }
      const summary = { projectId: key1, currencyCode: 'VND', totals: contract.totals, contracts: [row] }
      expect(projectMaterialFinanceSummarySchema.safeParse(summary).success).toBe(true)
      const { proposalNo: _proposalNo, ...rowWithoutProposalNo } = row
      expect(projectMaterialFinanceSummarySchema.safeParse({ ...summary, contracts: [rowWithoutProposalNo] }).success).toBe(false)

      const inboxRow = { projectId: key1, projectName: 'Eo Gió', proposalNo: 18, orderSeq: 1, orderId: key2, supplierName: 'NCC A' }
      const inbox = {
        awaitingContract: [{ ...inboxRow, orderSubtotal: '100.0000', createdAt: '2026-10-10T01:00:00+00:00' }],
        dueInstallments: [], returnedRequests: [], pendingApproval: [], approvedAwaitingPayment: [],
      }
      expect(materialFinanceInboxSchema.safeParse(inbox).success).toBe(true)
      const { orderSeq: _orderSeq, ...inboxRowWithoutSeq } = inboxRow
      expect(materialFinanceInboxSchema.safeParse({
        ...inbox, awaitingContract: [{ ...inboxRowWithoutSeq, orderSubtotal: '100.0000', createdAt: '2026-10-10T01:00:00+00:00' }],
      }).success).toBe(false)
    })
    it('accepts the proposal notification events', () => {
      for (const kind of ['material.proposal.submitted', 'material.proposal.approved', 'material.proposal.returned']) {
        expect(appNotificationEventKindSchema.safeParse(kind).success).toBe(true)
      }
      expect(appNotificationEventKindSchema.safeParse('material.proposal.deleted').success).toBe(false)
    })
    it('parses a cash payment with a null reference', () => {
      expect(materialPaymentRequestViewSchema.parse({ ...request, payment: { ...request.payment, method: 'cash', bankReference: null } }).payment)
        .toMatchObject({ method: 'cash', bankReference: null })
    })
  })
})
