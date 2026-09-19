import { describe, expect, it } from 'vitest'
import { financeOverviewSchema, moneyObservationSchema } from '../../../shared/schemas/costs/project-finance'
import { deriveFinanceDate, compareFinanceRows } from '../../../shared/utils/project-finance-dates'
import { computeConfirmedMargin, subtractFinanceMoney, sumFinanceMoney } from '../../../shared/utils/project-finance-money'
import { summarizeProjectFinance } from '../../../server/features/costs/finance/project-finance.summary'

describe('C1 finance read contracts', () => {
  it('keeps recorded zero distinct from an unrecorded observation', () => {
    expect(moneyObservationSchema.parse({ state: 'recorded', amount: '0.0000', recordedCount: 1 })).toEqual({ state: 'recorded', amount: '0.0000', recordedCount: 1 })
    expect(moneyObservationSchema.parse({ state: 'not_recorded', amount: null, recordedCount: 0 })).toEqual({ state: 'not_recorded', amount: null, recordedCount: 0 })
    expect(() => moneyObservationSchema.parse({ state: 'not_recorded', amount: '0.0000', recordedCount: 0 })).toThrow()
  })

  it('uses precision-safe four-place aggregates and preserves negative differences', () => {
    expect(sumFinanceMoney(['9999999999999999.9999', '9999999999999999.9999'])).toBe('19999999999999999.9998')
    expect(subtractFinanceMoney('10.0000', ['12.0000'])).toBe('-2.0000')
    expect(computeConfirmedMargin({ basis: 'unconfirmed', approvedReference: '400.0000', cost: '250.0000', retention: '10.0000' })).toBeNull()
    expect(computeConfirmedMargin({ basis: 'revenue_estimate', approvedReference: '400.0000', cost: '250.0000', retention: '10.0000' })).toBe('140.0000')
  })

  it('uses the configured timezone for fallback dates and a stable instant comparator', () => {
    expect(deriveFinanceDate(null, '2026-01-01T17:30:00.000Z', 'Asia/Bangkok')).toEqual({ effectiveDate: '2026-01-02', usedFallback: true })
    expect(compareFinanceRows(
      { effectiveDate: '2026-01-02', createdAt: '2026-01-01T00:00:00.000Z', lineNo: 2, id: 'b' },
      { effectiveDate: '2026-01-02', createdAt: '2025-12-31T17:00:00.000-07:00', lineNo: 1, id: 'a' },
      'newest',
    )).toBeGreaterThan(0)
  })

  it('keeps new overview responses status-free and strict', () => {
    const overview = {
      schemaVersion: 1,
      project: { projectId: '00000000-0000-4000-8000-000000000001', projectCode: 'P', projectName: 'Project', currencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok' },
      summary: {
        budget: { state: 'not_recorded', amount: null, recordedCount: 0 },
        ownerAdvances: { state: 'not_recorded', amount: null, recordedCount: 0 },
        cost: { state: 'not_recorded', amount: null, recordedCount: 0, knownSubtotal: '0.0000' },
        warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
        reference: { kind: 'none', amount: null },
        margin: { state: 'unavailable', amount: null, reasons: ['NO_APPROVED_BUDGET'] },
        issues: [],
      },
      categories: [],
    }
    expect(financeOverviewSchema.parse(overview)).toEqual(overview)
    expect(() => financeOverviewSchema.parse({ ...overview, workStatus: 'unknown' })).toThrow()
  })

  it('does not turn legacy subcontract coverage into a zero-cost claim', () => {
    const result = summarizeProjectFinance({
      ordinaryAmounts: ['100.0000', '20.0000', '30.0000', '10.0000'],
      recordedPayments: [{ paidAmount: '40.0000', retentionAmount: '5.0000', status: 'recorded' }, { paidAmount: '50.0000', retentionAmount: '5.0000', status: 'recorded' }, { paidAmount: '999.0000', retentionAmount: '1.0000', status: 'voided' }],
      legacySubcontractHasData: true,
      hasUnmappedParent: false,
      approvedBudget: null,
      ownerAdvanceAmounts: [],
    })
    expect(result.cost).toEqual({ state: 'needs_reconciliation', amount: null, recordedCount: 4, knownSubtotal: '160.0000' })
    expect(result.recordedPaymentsTotal).toBe('90.0000')
    expect(result.warrantyRetention).toEqual({ state: 'recorded', amount: '10.0000', recordedCount: 2 })
    expect(result.issues).toContainEqual({ code: 'LEGACY_SUBCONTRACT_RECONCILIATION_REQUIRED', categoryId: null })
  })
})
