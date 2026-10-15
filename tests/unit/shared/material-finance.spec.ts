import { describe, expect, it } from 'vitest'
import {
  amendMaterialContractInputSchema,
  decidePaymentRequestInputSchema,
  recordMaterialContractInputSchema,
  recordMaterialInvoiceInputSchema,
} from '../../../shared/schemas/costs/material-finance'

const key1 = '00000000-0000-4000-8000-000000000001'
const key2 = '00000000-0000-4000-8000-000000000002'
const file = '00000000-0000-4000-8000-0000000000f1'
const valid = {
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
})
