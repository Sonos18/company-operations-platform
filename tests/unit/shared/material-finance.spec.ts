import { describe, expect, it } from 'vitest'
import {
  amendMaterialContractInputSchema,
  decidePaymentRequestInputSchema,
  materialContractViewSchema,
  materialPaymentRequestViewSchema,
  recordMaterialContractInputSchema,
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
    it.each(['contractNo', 'contractFileId', 'vatAmount', 'total', 'installments'] as const)('rejects quotation_only carrying %s', key => {
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

  describe('views read from a database that may predate the migration', () => {
    const request = {
      id: key1, contractId: key2, installmentKey: key1, amount: '10.0000', note: null, state: 'paid', revisionNo: 1,
      submittedBy: key1, submittedAt: '2026-10-10T01:00:00+00:00', invoiceIds: [], cancelReason: null, version: 3, decisions: [],
      payment: { id: key1, paidOn: '2026-10-12', bankReference: 'UNC-1', proofFileId: file, paidBy: key1, recordedAt: '2026-10-12T01:00:00+00:00' },
    }
    const contract = {
      id: key1, orderId: key2, projectId: key1, supplierId: key2, supplierName: 'NCC A', currencyCode: 'VND',
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
        overdue: '0.0000', invoiced: '0.0000', paidWithoutInvoice: '0.0000',
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
    it('parses a cash payment with a null reference', () => {
      expect(materialPaymentRequestViewSchema.parse({ ...request, payment: { ...request.payment, method: 'cash', bankReference: null } }).payment)
        .toMatchObject({ method: 'cash', bankReference: null })
    })
  })
})
