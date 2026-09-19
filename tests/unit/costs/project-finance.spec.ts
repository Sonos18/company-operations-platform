import { describe, expect, it } from 'vitest'
import { financeOverviewSchema, moneyObservationSchema } from '../../../shared/schemas/costs/project-finance'
import { deriveFinanceDate, compareFinanceRows } from '../../../shared/utils/project-finance-dates'
import { computeConfirmedMargin, subtractFinanceMoney, sumFinanceMoney } from '../../../shared/utils/project-finance-money'
import { summarizeFinanceRows } from '../../../server/features/costs/finance/project-finance.summary'

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

  it('uses the production reducer for legacy subcontract reconciliation', () => {
    const result = summarizeFinanceRows({
      context: { projectId: '00000000-0000-4000-8000-000000000001', projectCode: 'P', projectName: 'Project', defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok' },
      rows: {
        categories: [{ id: '00000000-0000-4000-8000-000000000040', tenant_id: '00000000-0000-4000-8000-000000000010', company_id: '00000000-0000-4000-8000-000000000020', code: 'subcontract_labor', name: 'Subcontract', display_order: 1, is_active: true, version: 0 }],
        costItems: [{ id: '00000000-0000-4000-8000-000000000050', tenant_id: '00000000-0000-4000-8000-000000000010', company_id: '00000000-0000-4000-8000-000000000020', project_id: '00000000-0000-4000-8000-000000000001', cost_category_id: '00000000-0000-4000-8000-000000000040', description: 'Legacy', business_reference: null, amount_text: '100.0000', currency_code: 'VND', relevant_date: null, version: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }],
        details: [{ id: '00000000-0000-4000-8000-000000000060', tenant_id: '00000000-0000-4000-8000-000000000010', company_id: '00000000-0000-4000-8000-000000000020', project_cost_item_id: '00000000-0000-4000-8000-000000000050', line_no: 1, amount_text: '100.0000', retention_kind: 'warranty', retention_rate_bps: 500, retention_amount_text: '5.0000', relevant_date: '2026-01-01', version: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }],
        budgets: [], budgetLines: [], ownerAdvances: [], subcontracts: [], payments: [],
      },
    })
    expect(result.categories[0]?.cost.state).toBe('needs_reconciliation')
    expect(result.summary.warrantyRetention.state).toBe('not_recorded')
  })
})
