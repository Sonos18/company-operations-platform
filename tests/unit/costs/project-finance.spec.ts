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
      project: { projectId: '00000000-0000-4000-8000-000000000001', projectCode: 'P', projectName: 'Project', currencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', operationalState: 'unknown' },
      summary: {
        budget: { state: 'not_recorded', amount: null, recordedCount: 0 },
        ownerAdvances: { state: 'not_recorded', amount: null, recordedCount: 0 },
        cost: { state: 'not_recorded', amount: null, recordedCount: 0, knownSubtotal: '0.0000' },
        warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
        reference: { kind: 'none', amount: null },
        margin: { state: 'unavailable', amount: null, reasons: ['NO_APPROVED_BUDGET'] },
        management: {
          receipts: { state: 'not_recorded', amount: null, recordedCount: 0, origin: 'none', quality: 'not_recorded', coverage: 'none', sourceReferences: [] },
          reference: { kind: 'none', amount: null, basis: 'none' },
          result: { state: 'unavailable', amount: null, basis: 'none', components: { receipts: null, cost: null, independentlyHeldRetention: null }, reasons: ['NO_REFERENCE'] },
          headline: { kind: 'unavailable', amount: null, basis: 'none' },
        },
        issues: [],
      },
      categories: [],
    }
    expect(financeOverviewSchema.parse(overview)).toEqual(overview)
    expect(() => financeOverviewSchema.parse({ ...overview, workStatus: 'unknown' })).toThrow()
  })

  it('uses the production reducer for legacy subcontract reconciliation', () => {
    const result = summarizeFinanceRows({
      context: { projectId: '00000000-0000-4000-8000-000000000001', projectCode: 'P', projectName: 'Project', defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', operationalState: 'unknown' },
      rows: {
        categories: [{ id: '00000000-0000-4000-8000-000000000040', tenant_id: '00000000-0000-4000-8000-000000000010', company_id: '00000000-0000-4000-8000-000000000020', code: 'subcontract_labor', name: 'Subcontract', display_order: 1, is_active: true, version: 0 }],
        costItems: [{ id: '00000000-0000-4000-8000-000000000050', tenant_id: '00000000-0000-4000-8000-000000000010', company_id: '00000000-0000-4000-8000-000000000020', project_id: '00000000-0000-4000-8000-000000000001', cost_category_id: '00000000-0000-4000-8000-000000000040', description: 'Legacy', business_reference: null, amount_text: '100.0000', currency_code: 'VND', relevant_date: null, version: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }],
        details: [{ id: '00000000-0000-4000-8000-000000000060', tenant_id: '00000000-0000-4000-8000-000000000010', company_id: '00000000-0000-4000-8000-000000000020', project_cost_item_id: '00000000-0000-4000-8000-000000000050', line_no: 1, amount_text: '100.0000', retention_kind: 'warranty', retention_rate_bps: 500, retention_amount_text: '5.0000', relevant_date: '2026-01-01', version: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }],
        budgets: [], budgetLines: [], ownerAdvances: [{ id: '00000000-0000-4000-8000-000000000070', tenant_id: '00000000-0000-4000-8000-000000000010', company_id: '00000000-0000-4000-8000-000000000020', project_id: '00000000-0000-4000-8000-000000000001', amount_text: '200.0000', currency_code: 'VND', status: 'recorded', source_reference: 'synthetic/receipt', version: 0, updated_at: '2026-01-01T00:00:00.000Z' }], subcontracts: [], payments: [], resolutions: [],
      },
    })
    expect(result.categories[0]?.cost.state).toBe('needs_reconciliation')
    expect(result.summary.warrantyRetention.state).toBe('not_recorded')
    expect(result.summary.management.result).toMatchObject({ state: 'unavailable', amount: null, reasons: ['COST_INCOMPLETE'] })
  })

  it('uses a canonical subcontract resolution and confirmed zero retention to calculate the provisional result', () => {
    const tenant = '00000000-0000-4000-8000-000000000010'
    const company = '00000000-0000-4000-8000-000000000020'
    const project = '00000000-0000-4000-8000-000000000001'
    const categoryIds = {
      materials: '00000000-0000-4000-8000-000000000041',
      machinery: '00000000-0000-4000-8000-000000000042',
      direct: '00000000-0000-4000-8000-000000000043',
      subcontract: '00000000-0000-4000-8000-000000000044',
      other: '00000000-0000-4000-8000-000000000045',
    }
    const category = (id: string, code: string, order: number) => ({ id, tenant_id: tenant, company_id: company, code, name: code, display_order: order, is_active: true, version: 0 })
    const item = (id: string, categoryId: string, amount: string) => ({
      id, tenant_id: tenant, company_id: company, project_id: project, cost_category_id: categoryId, description: 'Item', business_reference: null,
      amount_text: amount, currency_code: 'VND', relevant_date: null, version: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    })
    const result = summarizeFinanceRows({
      context: { projectId: project, projectCode: 'P', projectName: 'Project', defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', operationalState: 'active' },
      rows: {
        categories: [
          category(categoryIds.materials, 'materials', 1),
          category(categoryIds.machinery, 'machinery', 2),
          category(categoryIds.direct, 'direct_labor', 3),
          category(categoryIds.subcontract, 'subcontract_labor', 4),
          category(categoryIds.other, 'other', 5),
        ],
        costItems: [
          item('00000000-0000-4000-8000-000000000051', categoryIds.materials, '10.0000'),
          item('00000000-0000-4000-8000-000000000052', categoryIds.machinery, '20.0000'),
          item('00000000-0000-4000-8000-000000000053', categoryIds.direct, '30.0000'),
          item('00000000-0000-4000-8000-000000000054', categoryIds.subcontract, '100.0000'),
          item('00000000-0000-4000-8000-000000000055', categoryIds.other, '40.0000'),
        ],
        details: [{
          id: '00000000-0000-4000-8000-000000000061', tenant_id: tenant, company_id: company,
          project_cost_item_id: '00000000-0000-4000-8000-000000000054', line_no: 1, amount_text: '100.0000',
          retention_kind: null, retention_rate_bps: null, retention_amount_text: null, relevant_date: null, version: 0,
          created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
        }],
        budgets: [],
        budgetLines: [],
        ownerAdvances: [{
          id: '00000000-0000-4000-8000-000000000071', tenant_id: tenant, company_id: company, project_id: project,
          amount_text: '200.0000', currency_code: 'VND', status: 'recorded', source_reference: 'synthetic/receipt', version: 0,
          updated_at: '2026-01-01T00:00:00.000Z',
        }],
        subcontracts: [{
          id: '00000000-0000-4000-8000-000000000081', tenant_id: tenant, company_id: company, project_id: project,
          subcontractor_party_id: '00000000-0000-4000-8000-000000000091', code: 'SUB-1', contract_no: null,
          contract_name: 'Reviewed subcontract', contract_date: null, contract_value_text: null, currency_code: 'VND',
          warranty_retention_rate_bps: 0, is_active: true, version: 0, updated_at: '2026-01-01T00:00:00.000Z',
        }],
        payments: [{
          id: '00000000-0000-4000-8000-000000000082', tenant_id: tenant, company_id: company, project_id: project,
          project_subcontract_id: '00000000-0000-4000-8000-000000000081', paid_amount_text: '50.0000',
          warranty_retention_amount_text: null, retention_rate_bps: null, currency_code: 'VND', status: 'recorded',
          payment_date: '2026-01-02', created_at: '2026-01-02T00:00:00.000Z', version: 0,
          updated_at: '2026-01-02T00:00:00.000Z',
        }],
        resolutions: [{
          id: '00000000-0000-4000-8000-000000000083', tenant_id: tenant, company_id: company, project_id: project,
          cost_category_id: categoryIds.subcontract, resolution_code: 'canonical_subcontract_payments_authoritative' as const,
          reason: 'Reviewed canonical payments', version: 0, updated_at: '2026-01-03T00:00:00.000Z',
        }],
      },
    })

    expect(result.categories.find(value => value.code === 'subcontract_labor')).toMatchObject({
      cost: { state: 'recorded', amount: '50.0000', recordedCount: 1 },
      warrantyRetention: { state: 'recorded', amount: '0.0000', recordedCount: 0 },
      legacyReconciliationRequired: false,
    })
    expect(result.summary.cost).toMatchObject({ state: 'recorded', amount: '150.0000', knownSubtotal: '150.0000' })
    expect(result.summary.warrantyRetention).toEqual({ state: 'recorded', amount: '0.0000', recordedCount: 0 })
    expect(result.summary.issues.map(value => value.code)).not.toContain('LEGACY_SUBCONTRACT_RECONCILIATION_REQUIRED')
    expect(result.summary.issues.map(value => value.code)).not.toContain('RETENTION_NOT_RECORDED')
    expect(result.summary.management.result).toEqual({
      state: 'provisional',
      amount: '50.0000',
      basis: 'owner_receipts',
      components: { receipts: '200.0000', cost: '150.0000', independentlyHeldRetention: '0.0000' },
      reasons: [],
    })
  })

  it('does not infer a positive default retention amount when a payment has no recorded retention', () => {
    const tenant = '00000000-0000-4000-8000-000000000010'
    const company = '00000000-0000-4000-8000-000000000020'
    const project = '00000000-0000-4000-8000-000000000001'
    const subcontractCategory = '00000000-0000-4000-8000-000000000044'
    const categories = ['materials', 'machinery', 'direct_labor', 'subcontract_labor', 'other'].map((code, index) => ({
      id: index === 3 ? subcontractCategory : `00000000-0000-4000-8000-00000000004${index + 1}`,
      tenant_id: tenant, company_id: company, code, name: code, display_order: index + 1, is_active: true, version: 0,
    }))
    const costItems = categories.map((category, index) => ({
      id: `00000000-0000-4000-8000-00000000005${index + 1}`, tenant_id: tenant, company_id: company, project_id: project,
      cost_category_id: category.id, description: 'Item', business_reference: null, amount_text: index === 3 ? '100.0000' : '10.0000',
      currency_code: 'VND', relevant_date: null, version: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    }))
    const result = summarizeFinanceRows({
      context: { projectId: project, projectCode: 'P', projectName: 'Project', defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', operationalState: 'active' },
      rows: {
        categories,
        costItems,
        details: [{
          id: '00000000-0000-4000-8000-000000000061', tenant_id: tenant, company_id: company,
          project_cost_item_id: costItems[3]!.id, line_no: 1, amount_text: '100.0000', retention_kind: null,
          retention_rate_bps: null, retention_amount_text: null, relevant_date: null, version: 0,
          created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
        }],
        budgets: [], budgetLines: [],
        ownerAdvances: [{
          id: '00000000-0000-4000-8000-000000000071', tenant_id: tenant, company_id: company, project_id: project,
          amount_text: '200.0000', currency_code: 'VND', status: 'recorded', source_reference: 'synthetic/receipt', version: 0,
          updated_at: '2026-01-01T00:00:00.000Z',
        }],
        subcontracts: [{
          id: '00000000-0000-4000-8000-000000000081', tenant_id: tenant, company_id: company, project_id: project,
          subcontractor_party_id: '00000000-0000-4000-8000-000000000091', code: 'SUB-1', contract_no: null,
          contract_name: 'Subcontract', contract_date: null, contract_value_text: null, currency_code: 'VND',
          warranty_retention_rate_bps: 500, is_active: true, version: 0, updated_at: '2026-01-01T00:00:00.000Z',
        }],
        payments: [{
          id: '00000000-0000-4000-8000-000000000082', tenant_id: tenant, company_id: company, project_id: project,
          project_subcontract_id: '00000000-0000-4000-8000-000000000081', paid_amount_text: '50.0000',
          warranty_retention_amount_text: null, retention_rate_bps: null, currency_code: 'VND', status: 'recorded',
          payment_date: '2026-01-02', created_at: '2026-01-02T00:00:00.000Z', version: 0,
          updated_at: '2026-01-02T00:00:00.000Z',
        }],
        resolutions: [{
          id: '00000000-0000-4000-8000-000000000083', tenant_id: tenant, company_id: company, project_id: project,
          cost_category_id: subcontractCategory, resolution_code: 'canonical_subcontract_payments_authoritative' as const,
          reason: 'Reviewed canonical payments', version: 0, updated_at: '2026-01-03T00:00:00.000Z',
        }],
      },
    })
    expect(result.summary.cost.state).toBe('recorded')
    expect(result.summary.warrantyRetention.state).not.toBe('recorded')
    expect(result.summary.management.result).toMatchObject({ state: 'unavailable', amount: null, reasons: ['RETENTION_INCOMPLETE'] })
  })

})
