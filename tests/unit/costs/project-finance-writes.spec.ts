import { describe, expect, it } from 'vitest'
import { recordSubcontractPaymentInputSchema, voidSubcontractPaymentInputSchema } from '../../../shared/schemas/costs/project-finance-writes'

const base = { expectedSubcontractVersion: 0, description: 'Voucher', paidAmount: '100.0000', currencyCode: 'VND' }
describe('project finance write contracts', () => {
  it('requires strict positive cash and a subcontract version', () => {
    expect(recordSubcontractPaymentInputSchema.safeParse(base).success).toBe(true)
    for (const paidAmount of ['0', '-1', '1.00001', 1]) expect(recordSubcontractPaymentInputSchema.safeParse({ ...base, paidAmount }).success).toBe(false)
    expect(recordSubcontractPaymentInputSchema.safeParse({ description: 'Voucher', paidAmount: '1', currencyCode: 'VND' }).success).toBe(false)
  })
  it('validates retention, evidence, and replacement identity without caller scope fields', () => {
    const id = 'c1080000-0000-4000-8000-000000000401'
    expect(recordSubcontractPaymentInputSchema.safeParse({ ...base, warrantyRetentionAmount: '0.0000', retentionRateBps: 0, replacesPaymentId: id, evidenceFileIds: [id] }).success).toBe(true)
    expect(recordSubcontractPaymentInputSchema.safeParse({ ...base, retentionRateBps: 500 }).success).toBe(false)
    expect(recordSubcontractPaymentInputSchema.safeParse({ ...base, evidenceFileIds: [id, id] }).success).toBe(false)
    expect(recordSubcontractPaymentInputSchema.safeParse({ ...base, projectId: id }).success).toBe(false)
  })
  it('requires expectedVersion and a nonblank void reason', () => {
    expect(voidSubcontractPaymentInputSchema.safeParse({ expectedVersion: 0, reason: 'Wrong voucher' }).success).toBe(true)
    expect(voidSubcontractPaymentInputSchema.safeParse({ expectedVersion: 0, reason: '  ' }).success).toBe(false)
    expect(voidSubcontractPaymentInputSchema.safeParse({ reason: 'Wrong voucher' }).success).toBe(false)
  })
})
