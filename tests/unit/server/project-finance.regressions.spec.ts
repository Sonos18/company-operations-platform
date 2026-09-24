import { describe, expect, it } from 'vitest'
import { financeListQuerySchema, itemDetailQuerySchema, paymentQuerySchema } from '../../../shared/schemas/costs/project-finance'
import { compareFinanceRows } from '../../../shared/utils/project-finance-dates'
import { sumFinanceMoney } from '../../../shared/utils/project-finance-money'
import { AppApiError } from '../../../server/utils/api-error'
import { ProjectFinanceMetadataReader, ProjectFinanceTableReader, type FinanceProjectContextRow, type FinanceTableRows } from '../../../server/features/costs/finance/project-finance.queries'
import { ConcreteProjectFinanceRepository, createSupabaseProjectFinanceRepository } from '../../../server/features/costs/finance/project-finance.repository'
import { ProjectFinanceService } from '../../../server/features/costs/finance/project-finance.service'
import { paymentTotal } from '../../../server/features/costs/finance/project-finance.summary'

const ids = {
  tenant: 'c1070000-0000-4000-8000-000000000010', company: 'c1070000-0000-4000-8000-000000000020', project: 'c1070000-0000-4000-8000-000000000030', otherProject: 'c1070000-0000-4000-8000-000000000031',
  materials: 'c1070000-0000-4000-8000-000000000040', subcontract: 'c1070000-0000-4000-8000-000000000041', materialsItem: 'c1070000-0000-4000-8000-000000000050', legacyItem: 'c1070000-0000-4000-8000-000000000051', party: 'c1070000-0000-4000-8000-000000000060', contract: 'c1070000-0000-4000-8000-000000000070',
  detailNoRetention: 'c1070000-0000-4000-8000-000000000080', detailZeroRetention: 'c1070000-0000-4000-8000-000000000081', detailWarranty: 'c1070000-0000-4000-8000-000000000082', detailOther: 'c1070000-0000-4000-8000-000000000083', legacyDetail: 'c1070000-0000-4000-8000-000000000084', paymentNoRetention: 'c1070000-0000-4000-8000-000000000090', paymentZeroRetention: 'c1070000-0000-4000-8000-000000000091', paymentWarranty: 'c1070000-0000-4000-8000-000000000092',
}
const multiIds = {
  projectB: 'c1070000-0000-4000-8000-000000000032', projectC: 'c1070000-0000-4000-8000-000000000033',
  itemB: 'c1070000-0000-4000-8000-000000000120', itemC: 'c1070000-0000-4000-8000-000000000121',
  partyB: 'c1070000-0000-4000-8000-000000000122', partyC: 'c1070000-0000-4000-8000-000000000123',
  contractB: 'c1070000-0000-4000-8000-000000000124', contractC: 'c1070000-0000-4000-8000-000000000125',
  budgetB: 'c1070000-0000-4000-8000-000000000126', budgetC: 'c1070000-0000-4000-8000-000000000127',
  lineB: 'c1070000-0000-4000-8000-000000000128', lineC: 'c1070000-0000-4000-8000-000000000129',
  paymentB: 'c1070000-0000-4000-8000-000000000130', paymentC: 'c1070000-0000-4000-8000-000000000131',
}

const createdAt = '2026-01-01T00:00:00.000Z'
const context: FinanceProjectContextRow = { projectId: ids.project, projectCode: 'P107', projectName: 'Finance regression project', defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', operationalState: 'unknown' }
const scope = { tenantId: ids.tenant, companyId: ids.company, permissions: ['cost.read'] }
const directoryQuery = { afterId: undefined, pageSize: 25 } as const
const listQuery = financeListQuerySchema.parse({ page: 1, pageSize: 100, sort: 'newest' })
const paymentQuery = paymentQuerySchema.parse({ page: 1, pageSize: 100, sort: 'newest', retention: 'all' })
const itemQuery = itemDetailQuerySchema.parse({ page: 1, pageSize: 100, sort: 'newest', retention: 'all' })

function category(id: string, code: string, displayOrder: number) {
  return { id, tenant_id: ids.tenant, company_id: ids.company, code, name: code, display_order: displayOrder, is_active: true, version: 0 }
}
function item(id: string, categoryId: string, amount: string, relevantDate: string | null = '2026-01-10') {
  return { id, tenant_id: ids.tenant, company_id: ids.company, project_id: ids.project, cost_category_id: categoryId, description: id, business_reference: null, amount_text: amount, currency_code: 'VND', relevant_date: relevantDate, publication_state: 'published' as const, version: 0, created_at: createdAt, updated_at: createdAt }
}
function detail(id: string, itemId: string, lineNo: number, amount: string, retentionKind: 'warranty' | 'other' | null, retentionAmount: string | null, relevantDate: string | null) {
  return { id, tenant_id: ids.tenant, company_id: ids.company, project_cost_item_id: itemId, line_no: lineNo, detail_kind: 'line_item' as const, description: id, quantity_text: null, unit_code: null, unit_price_text: null, amount_text: amount, retention_kind: retentionKind, retention_rate_bps: retentionKind === null ? null : 500, retention_amount_text: retentionAmount, relevant_date: relevantDate, reference: null, note: null, publication_state: 'published' as const, version: 0, created_at: createdAt, updated_at: createdAt }
}
function payment(id: string, amount: string, retention: string | null, paymentDate = '2026-02-10', status: 'recorded' | 'voided' = 'recorded', replacesPaymentId: string | null = null, contractId = ids.contract) {
  return { id, tenant_id: ids.tenant, company_id: ids.company, project_id: ids.project, project_subcontract_id: contractId, paid_amount_text: amount, warranty_retention_amount_text: retention, retention_rate_bps: 500, currency_code: 'VND', status, description: id, payment_date: paymentDate, payment_reference: null, source_reference: null, note: null, replaces_payment_id: replacesPaymentId, created_at: createdAt, version: 0, updated_at: createdAt }
}

function readSet(budgetAmount = '400.00'): FinanceTableRows & { context: typeof context, parties: readonly { partyId: string, code: string, displayName: string, partyKind: 'organization' }[] } {
  return {
    context,
    categories: [category(ids.materials, 'materials', 1), category(ids.subcontract, 'subcontract_labor', 2)],
    costItems: [item(ids.materialsItem, ids.materials, '100.0000', '2026-01-10'), item(ids.legacyItem, ids.subcontract, '50.0000', '2026-01-01')],
    details: [
      detail(ids.detailNoRetention, ids.materialsItem, 1, '10.0000', null, null, '2026-02-01'),
      detail(ids.detailZeroRetention, ids.materialsItem, 2, '20.0000', 'warranty', '0', '2026-02-02'),
      detail(ids.detailWarranty, ids.materialsItem, 3, '60.0000', 'warranty', '5.0000', '2026-02-03'),
      detail(ids.detailOther, ids.materialsItem, 4, '10.0000', 'other', '2.0000', '2026-02-04'),
      detail(ids.legacyDetail, ids.legacyItem, 1, '50.0000', 'warranty', '5.0000', '2026-02-05'),
    ],
    budgets: [{ id: 'c1070000-0000-4000-8000-000000000100', tenant_id: ids.tenant, company_id: ids.company, project_id: ids.project, revision_no: 1, name: 'Approved', currency_code: 'VND', detail_mode: 'summary', total_amount_text: budgetAmount, status: 'approved', approved_at: createdAt, effective_date: '2026-01-01', reference: null, source_reference: null, note: null, version: 0, updated_at: createdAt }],
    budgetLines: [],
    ownerAdvances: [],
    subcontracts: [{ id: ids.contract, tenant_id: ids.tenant, company_id: ids.company, project_id: ids.project, subcontractor_party_id: ids.party, code: 'SC-107', contract_no: null, contract_name: 'Contract', contract_date: '2026-01-01', contract_value_text: '1000.0000', currency_code: 'VND', warranty_retention_rate_bps: 500, is_active: true, reference: null, source_reference: null, note: null, version: 0, updated_at: createdAt }],
    payments: [payment(ids.paymentNoRetention, '10.0000', null), payment(ids.paymentZeroRetention, '20.0000', '0'), payment(ids.paymentWarranty, '30.0000', '5.0000'), payment('c1070000-0000-4000-8000-000000000093', '99.0000', '9.0000', '2026-02-11', 'voided')],
    parties: [{ partyId: ids.party, code: 'PARTY-107', displayName: 'Synthetic party', partyKind: 'organization' }],
  }
}

function multiSnapshot(projectId: string, projectCode: string, currencyCode: string, itemId: string, partyId: string, contractId: string, budgetId: string, lineId: string, paymentId: string, budgetAmount: string, ownerAmount: string | null, costAmount: string) {
  const rows = readSet(budgetAmount)
  rows.context = { ...context, projectId, projectCode, projectName: projectCode, defaultCurrencyCode: currencyCode }
  rows.costItems = [{ ...rows.costItems[0]!, id: itemId, project_id: projectId, amount_text: costAmount, currency_code: currencyCode }]
  rows.details = []
  rows.budgets = [{ ...rows.budgets[0]!, id: budgetId, project_id: projectId, currency_code: currencyCode, total_amount_text: budgetAmount, detail_mode: 'categorized' }]
  rows.budgetLines = [{ id: lineId, tenant_id: ids.tenant, company_id: ids.company, project_id: projectId, budget_version_id: budgetId, cost_category_id: ids.materials, line_no: 1, amount_text: budgetAmount, description: 'Budget line', reference: null, source_reference: null, note: null, version: 0, updated_at: createdAt }]
  rows.ownerAdvances = ownerAmount === null ? [] : [{ id: `${ownerAmount === '100.0000' ? 'c1070000-0000-4000-8000-000000000132' : 'c1070000-0000-4000-8000-000000000133'}`, tenant_id: ids.tenant, company_id: ids.company, project_id: projectId, amount_text: ownerAmount, currency_code: currencyCode, status: 'recorded', description: 'Owner receipt', payer_name: 'Owner', receipt_no: projectCode, received_date: '2026-02-01', reference: null, source_reference: null, note: null, version: 0, created_at: createdAt, updated_at: createdAt }]
  rows.subcontracts = [{ id: contractId, tenant_id: ids.tenant, company_id: ids.company, project_id: projectId, subcontractor_party_id: partyId, code: `${projectCode}-SC`, contract_no: null, contract_name: 'Contract', contract_date: '2026-01-01', contract_value_text: currencyCode === 'USD' ? '1000.0000' : '1000000.0000', currency_code: currencyCode, warranty_retention_rate_bps: 500, is_active: true, reference: null, source_reference: null, note: null, version: 0, updated_at: createdAt }]
  rows.payments = [{ id: paymentId, tenant_id: ids.tenant, company_id: ids.company, project_id: projectId, project_subcontract_id: contractId, paid_amount_text: currencyCode === 'USD' ? '200.0000' : '200000.0000', warranty_retention_amount_text: currencyCode === 'USD' ? '10.0000' : '10000.0000', retention_rate_bps: 500, currency_code: currencyCode, status: 'recorded', description: 'Payment', payment_date: '2026-02-02', payment_reference: null, source_reference: null, note: null, replaces_payment_id: null, created_at: createdAt, version: 0, updated_at: createdAt }]
  rows.parties = [{ partyId, code: `${projectCode}-PARTY`, displayName: `${projectCode} party`, partyKind: 'organization' }]
  return rows
}

function concrete(rows: FinanceTableRows & { context: typeof context, parties: readonly { partyId: string, code: string, displayName: string, partyKind: 'organization' }[] }) {
  const source = {
    read: async (_scope: unknown, _projectId: string, _fullDetails?: boolean) => ({ signature: 'stable', readSet: rows, consistent: async () => true }),
    directory: async () => ({ defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', projects: [{ projectId: ids.project, projectCode: context.projectCode, projectName: context.projectName }], nextCursor: null }),
    readMany: async () => new Map([[ids.project, rows]]),
  }
  return new ConcreteProjectFinanceRepository(source as never)
}

function fakeSupabase(rows: ReturnType<typeof readSet>) {
  const tableRows: Record<string, readonly Record<string, unknown>[]> = {
    cost_categories: rows.categories,
    project_cost_items: rows.costItems,
    project_cost_item_details: rows.details,
    project_budget_versions: rows.budgets,
    project_budget_lines: rows.budgetLines,
    project_owner_advances: rows.ownerAdvances,
    project_subcontracts: rows.subcontracts,
    project_subcontract_payments: rows.payments,
    project_cost_reconciliation_resolutions: [],
  }
  return {
    from(table: string) {
      let selected = ''
      const equals = new Map<string, string>()
      const ins = new Map<string, readonly string[]>()
      let greaterThan: string | null = null
      const query = {
        select(columns: string) { selected = columns; return query },
        eq(field: string, value: string) { equals.set(field, value); return query },
        in(field: string, values: readonly string[]) { ins.set(field, values); return query },
        gt(_field: string, value: string) { greaterThan = value; return query },
        order() { return query },
        async limit(size: number) {
          const fields = selected.split(',')
          const values = [...(tableRows[table] ?? [])].filter(row => [...equals].every(([field, value]) => row[field] === value)).filter(row => [...ins].every(([field, allowed]) => allowed.includes(String(row[field])))).filter(row => greaterThan === null || String(row.id) > greaterThan)
          values.sort((left, right) => String(left.id).localeCompare(String(right.id)))
          return { data: values.slice(0, size).map(row => Object.fromEntries(fields.map(field => [field, row[field]]))), error: null }
        },
      }
      return query
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === 'c1_read_project_cost_read_context') return { data: { projectId: context.projectId, projectCode: context.projectCode, projectName: context.projectName, defaultCurrencyCode: context.defaultCurrencyCode, moneyScale: context.moneyScale, timeZone: context.timeZone }, error: null }
      if (name === 'c1_read_project_finance_operational_states') return { data: [{ projectId: ids.project, operationalState: context.operationalState }], error: null }
      if (name === 'c1_read_project_finance_directory') return { data: { defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', projects: [{ projectId: ids.project, projectCode: context.projectCode, projectName: context.projectName }], nextCursor: null }, error: null }
      return { data: rows.parties.filter(party => (args.target_party_ids as string[]).includes(party.partyId)), error: null }
    },
  }
}

function fakeSupabaseMulti(projectRows: readonly ReturnType<typeof multiSnapshot>[]) {
  const tableRows: Record<string, readonly Record<string, unknown>[]> = {
    cost_categories: projectRows[0]!.categories,
    project_cost_items: projectRows.flatMap(rows => rows.costItems),
    project_cost_item_details: [],
    project_budget_versions: projectRows.flatMap(rows => rows.budgets),
    project_budget_lines: projectRows.flatMap(rows => rows.budgetLines),
    project_owner_advances: projectRows.flatMap(rows => rows.ownerAdvances),
    project_subcontracts: projectRows.flatMap(rows => rows.subcontracts),
    project_subcontract_payments: projectRows.flatMap(rows => rows.payments),
    project_cost_reconciliation_resolutions: [],
  }
  const batchProjectQueries: Array<{ table: string, ids: string[] }> = []
  let contextCalls = 0
  let directoryCalls = 0
  let stateCalls = 0
  return {
    batchProjectQueries,
    get contextCalls() { return contextCalls },
    get directoryCalls() { return directoryCalls },
    get stateCalls() { return stateCalls },
    from(table: string) {
      if (!(table in tableRows)) throw new Error(`Unexpected table read: ${table}`)
      let selected = ''
      const equals = new Map<string, string>()
      const ins = new Map<string, readonly string[]>()
      let greaterThan: string | null = null
      const query = {
        select(columns: string) { selected = columns; return query },
        eq(field: string, value: string) { equals.set(field, value); return query },
        in(field: string, values: readonly string[]) { ins.set(field, values); if (field === 'project_id') batchProjectQueries.push({ table, ids: [...values] }); return query },
        gt(_field: string, value: string) { greaterThan = value; return query },
        order() { return query },
        async limit(size: number) {
          const fields = selected.split(',')
          const values = [...(tableRows[table] ?? [])].filter(row => [...equals].every(([field, value]) => row[field] === value)).filter(row => [...ins].every(([field, allowed]) => allowed.includes(String(row[field])))).filter(row => greaterThan === null || String(row.id) > greaterThan)
          values.sort((left, right) => String(left.id).localeCompare(String(right.id)))
          return { data: values.slice(0, size).map(row => Object.fromEntries(fields.map(field => [field, row[field]]))), error: null }
        },
      }
      return query
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === 'c1_read_project_finance_operational_states') {
        stateCalls += 1
        if (args.target_company_id !== ids.company) return { data: null, error: { code: 'COMPANY_FORBIDDEN' } }
        const projectIds = args.target_project_ids as string[]
        return { data: projectRows.filter(rows => projectIds.includes(rows.context.projectId)).map(rows => ({ projectId: rows.context.projectId, operationalState: rows.context.operationalState })), error: null }
      }
      if (name === 'c1_read_project_cost_read_context') {
        contextCalls += 1
        const found = args.target_company_id === ids.company ? projectRows.find(rows => rows.context.projectId === args.target_project_id) : undefined
        return { data: found ? { projectId: found.context.projectId, projectCode: found.context.projectCode, projectName: found.context.projectName, defaultCurrencyCode: found.context.defaultCurrencyCode, moneyScale: found.context.moneyScale, timeZone: found.context.timeZone } : null, error: null }
      }
      if (name === 'c1_read_project_finance_directory') {
        directoryCalls += 1
        if (args.target_company_id !== ids.company) return { data: null, error: { code: 'COMPANY_FORBIDDEN' } }
        const afterId = typeof args.target_after_id === 'string' ? args.target_after_id : null
        const limit = Number(args.target_limit)
        const projects = projectRows.map(rows => ({ projectId: rows.context.projectId, projectCode: rows.context.projectCode, projectName: rows.context.projectName })).sort((left, right) => left.projectId.localeCompare(right.projectId)).filter(project => afterId === null || project.projectId > afterId).slice(0, limit)
        return { data: { defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', projects, nextCursor: projects.length === limit ? projects.at(-1)?.projectId ?? null : null }, error: null }
      }
      const found = args.target_company_id === ids.company ? projectRows.find(rows => rows.subcontracts.some(contract => contract.project_id === args.target_project_id)) : undefined
      return { data: found?.parties.filter(party => (args.target_party_ids as string[]).includes(party.partyId)) ?? [], error: null }
    },
  }
}

describe('C1 finance review regressions on concrete production readers', () => {
  it('counts a void-and-replacement cash correction exactly once', () => {
    expect(paymentTotal([
      { paid_amount_text: '100.0000', warranty_retention_amount_text: null, status: 'voided' },
      { paid_amount_text: '90.0000', warranty_retention_amount_text: null, status: 'recorded' },
    ])).toMatchObject({ amount: '90.0000', count: 1 })
  })

  it('keeps voided payment history visible while every economic total remains recorded-only', async () => {
    const repository = concrete(readSet())
    const contract = await repository.subcontract(scope, ids.project, ids.contract, paymentQuery)
    const party = await repository.subcontractor(scope, ids.project, ids.party, paymentQuery)
    const voidedId = 'c1070000-0000-4000-8000-000000000093'

    expect(contract.payments.rows.map(row => row.id)).toEqual([voidedId, ids.paymentNoRetention, ids.paymentZeroRetention, ids.paymentWarranty])
    expect(contract.payments.rows[0]).toMatchObject({ id: voidedId, contractId: ids.contract, recordStatus: 'voided' })
    expect(contract.payments.pagination).toMatchObject({ filteredCount: 4, fullCount: 4, filteredAmount: '60.0000', fullAmount: '60.0000' })
    expect(contract.payments).toMatchObject({ recordedTotal: '60.0000', recordedCount: 3, recordedRetentionTotal: '5.0000', recordedRetentionRowCount: 2 })
    expect(party.payments).toEqual(contract.payments)
    expect(contract.contract).toMatchObject({ paidTotal: '60.0000', paidCount: 3, recordedRetentionTotal: '5.0000', recordedRetentionRowCount: 2 })
  })

  it('derives same-contract replacement identity without counting the voided original', async () => {
    const rows = readSet()
    const voidedId = 'c1070000-0000-4000-8000-000000000093'
    const replacementId = 'c1070000-0000-4000-8000-000000000094'
    rows.payments.push(payment(replacementId, '90.0000', '4.0000', '2026-02-12', 'recorded', voidedId))

    const contract = await concrete(rows).subcontract(scope, ids.project, ids.contract, paymentQuery)
    expect(contract.payments.rows.find(row => row.id === voidedId)).toMatchObject({ recordStatus: 'voided', replacementPaymentId: replacementId })
    expect(contract.payments.rows.find(row => row.id === replacementId)).toMatchObject({ recordStatus: 'recorded', replacementPaymentId: null })
    expect(contract.payments).toMatchObject({ recordedTotal: '150.0000', recordedCount: 4, recordedRetentionTotal: '9.0000', recordedRetentionRowCount: 3 })
    expect(contract.contract).toMatchObject({ paidTotal: '150.0000', paidCount: 4, recordedRetentionTotal: '9.0000', recordedRetentionRowCount: 3 })
  })

  it('does not infer replacement state across subcontract contracts', async () => {
    const rows = readSet()
    const voidedId = 'c1070000-0000-4000-8000-000000000093'
    const otherContract = 'c1070000-0000-4000-8000-000000000075'
    rows.subcontracts.push({ ...rows.subcontracts[0]!, id: otherContract, code: 'SC-OTHER' })
    rows.payments.push(payment('c1070000-0000-4000-8000-000000000095', '70.0000', null, '2026-02-12', 'recorded', voidedId, otherContract))

    const contract = await concrete(rows).subcontract(scope, ids.project, ids.contract, paymentQuery)
    expect(contract.payments.rows.find(row => row.id === voidedId)).toMatchObject({ replacementPaymentId: null })
  })

  it('keeps draft cost parents out of official finance totals', async () => {
    const rows = readSet()
    rows.costItems = [
      { ...rows.costItems[0]!, publication_state: 'published' },
      { ...rows.costItems[0]!, id: multiIds.itemB, amount_text: '999.0000', publication_state: 'draft' },
    ] as never
    rows.details = []

    const overview = await concrete(rows).overview(scope, ids.project)

    expect(overview.categories.find(category => category.code === 'materials')?.cost.amount).toBe('100.0000')
  })

  it('F01 includes no-retention, zero-retention, warranty and other rows in default and filtered pages', async () => {
    const repository = concrete(readSet())
    const item = await repository.itemDetails(scope, ids.project, ids.materialsItem, itemQuery)
    const party = await repository.subcontractor(scope, ids.project, ids.party, paymentQuery)
    const contract = await repository.subcontract(scope, ids.project, ids.contract, paymentQuery)
    expect(item.kind).toBe('ordinary')
    if (item.kind === 'ordinary') expect(item.details.pagination).toMatchObject({ filteredCount: 4, filteredAmount: '100.0000', fullCount: 4, fullAmount: '100.0000' })
    expect(party.payments.pagination).toMatchObject({ filteredCount: 4, filteredAmount: '60.0000', fullCount: 4, fullAmount: '60.0000' })
    expect(contract.payments.pagination).toMatchObject({ filteredCount: 4, filteredAmount: '60.0000', fullCount: 4, fullAmount: '60.0000' })
    const warranty = await repository.subcontract(scope, ids.project, ids.contract, paymentQuerySchema.parse({ page: 1, pageSize: 100, sort: 'newest', retention: 'warranty' }))
    expect(warranty.payments.pagination).toMatchObject({ filteredCount: 3, filteredAmount: '50.0000' })
    const noRecordedRetention = await repository.subcontract(scope, ids.project, ids.contract, paymentQuerySchema.parse({ page: 1, pageSize: 100, sort: 'newest', retention: 'no_recorded_retention' }))
    expect(noRecordedRetention.payments.rows.map(row => row.id)).toEqual([ids.paymentNoRetention])
    const other = await repository.itemDetails(scope, ids.project, ids.materialsItem, itemDetailQuerySchema.parse({ page: 1, pageSize: 100, sort: 'newest', retention: 'other' }))
    const noDetailRetention = await repository.itemDetails(scope, ids.project, ids.materialsItem, itemDetailQuerySchema.parse({ page: 1, pageSize: 100, sort: 'newest', retention: 'no_recorded_retention' }))
    if (other.kind === 'ordinary' && noDetailRetention.kind === 'ordinary') {
      expect(other.details.rows.map(row => row.id)).toEqual([ids.detailOther])
      expect(noDetailRetention.details.rows.map(row => row.id)).toEqual([ids.detailNoRetention])
    }
  })

  it.each(['0', '400', '400.00', '400.0000', '9999999999999999.9999'])('F02 normalizes approved reference %s', async budgetAmount => {
    const result = await concrete(readSet(budgetAmount)).overview(scope, ids.project)
    expect(result.summary.reference.amount).toBe(sumFinanceMoney([budgetAmount]))
    expect(result.summary.budget.amount).toBe(sumFinanceMoney([budgetAmount]))
  })

  it('F03 excludes legacy subcontract retention from canonical summary retention', async () => {
    const result = await concrete(readSet()).overview(scope, ids.project)
    expect(result.summary.warrantyRetention).toEqual({ state: 'needs_reconciliation', amount: null, recordedCount: 4 })
    expect(result.categories.find(category => category.code === 'subcontract_labor')).toMatchObject({ legacyReconciliationRequired: true, warrantyRetention: { state: 'needs_reconciliation', amount: null, recordedCount: 2 } })
  })

  it('F05 uses latest detail/payment dates and row-specific date sources', async () => {
    const result = await concrete(readSet()).overview(scope, ids.project)
    expect(result.categories.find(category => category.code === 'materials')).toMatchObject({ latestRecordedDate: '2026-02-04', latestRecordedDateSource: 'business_date' })
    expect(result.categories.find(category => category.code === 'subcontract_labor')).toMatchObject({ latestRecordedDate: '2026-02-10', latestRecordedDateSource: 'business_date' })
    const contract = await concrete(readSet()).subcontract(scope, ids.project, ids.contract, paymentQuery)
    expect(contract.payments.rows[0]?.dateSource).toBe('payment_date')
    const rows = readSet()
    rows.ownerAdvances = [{ id: 'c1070000-0000-4000-8000-000000000110', tenant_id: ids.tenant, company_id: ids.company, project_id: ids.project, amount_text: '1.0000', currency_code: 'VND', status: 'recorded', description: 'Receipt', payer_name: 'Owner', receipt_no: 'R-107', received_date: '2026-02-12', reference: null, source_reference: null, note: null, version: 0, created_at: createdAt, updated_at: createdAt }]
    const advances = await concrete(rows).ownerAdvances(scope, ids.project, listQuery)
    expect(advances.rows[0]?.dateSource).toBe('received_date')
  })

  it('F06 rejects wrong project rows, wrong context identity and duplicate party responses', async () => {
    const wrongProject = { ...readSet().costItems[0]!, project_id: 'c1070000-0000-4000-8000-000000000032' }
    let after: string | null = null
    const query = { select: () => query, eq: () => query, in: () => query, gt: (_field: string, value: string) => { after = value; return query }, order: () => query, limit: async () => ({ data: after === null ? [wrongProject] : [], error: null }) }
    const reader = new ProjectFinanceTableReader({ from: () => query } as never)
    await expect(reader.costItemsForProjects(ids.tenant, ids.company, [ids.project, ids.otherProject])).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
    const metadata = new ProjectFinanceMetadataReader({ rpc: async name => name === 'c1_read_project_cost_read_context' ? { data: { ...context, projectId: ids.otherProject }, error: null } : { data: [{ ...readSet().parties[0], partyId: ids.party }, { ...readSet().parties[0], partyId: ids.party }], error: null } })
    await expect(metadata.context(ids.company, ids.project)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
    await expect(metadata.parties(ids.company, ids.project, [ids.party, ids.materials])).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
  })

  it('F04 retries batched directory collection without overview-per-project calls', async () => {
    const rows = readSet()
    const maps = [new Map([[ids.project, rows]]), new Map([[ids.project, rows]])]
    let reads = 0
    const repository = new ConcreteProjectFinanceRepository({
      directory: async () => ({ defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', projects: [{ projectId: ids.project, projectCode: context.projectCode, projectName: context.projectName }], nextCursor: null }),
      read: async () => ({ signature: 'unused', readSet: rows, consistent: async () => true }),
      readMany: async () => ({ readSets: maps[Math.min(reads++, 1)]!, signature: `v${reads}`, consistent: async () => reads > 1 }),
    } as never)
    await expect(repository.listProjects(scope, directoryQuery)).resolves.toMatchObject({ projects: [{ project: { projectId: ids.project } }] })
    expect(reads).toBe(2)
  })

  it('F04 fails closed on permanent batched inconsistency and later collection errors', async () => {
    const rows = readSet()
    let attempts = 0
    const unstable = new ConcreteProjectFinanceRepository({
      directory: async () => ({ defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', projects: [{ projectId: ids.project, projectCode: context.projectCode, projectName: context.projectName }], nextCursor: null }),
      read: async () => ({ signature: 'unused', readSet: rows, consistent: async () => true }),
      readMany: async () => ({ readSets: new Map([[ids.project, rows]]), signature: `v${++attempts}`, consistent: async () => false }),
    } as never)
    await expect(unstable.listProjects(scope, directoryQuery)).rejects.toMatchObject({ code: 'INTERNAL_ERROR', details: { reason: 'DATA_CONSISTENCY_ERROR' } })
    expect(attempts).toBe(2)
    const failing = new ConcreteProjectFinanceRepository({
      directory: async () => ({ defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', projects: [{ projectId: ids.project, projectCode: context.projectCode, projectName: context.projectName }], nextCursor: null }),
      read: async () => ({ signature: 'unused', readSet: rows, consistent: async () => true }),
      readMany: async () => { throw new AppApiError(500, 'INTERNAL_ERROR', 'later page failed') },
    } as never)
    await expect(failing.listProjects(scope, directoryQuery)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
  })

  it('F07 exercises every concrete factory method and strict response path with nonempty data', async () => {
    const repository = createSupabaseProjectFinanceRepository(fakeSupabase(readSet()) as never)
    await expect(repository.listProjects(scope, directoryQuery)).resolves.toMatchObject({ projects: [{ project: { projectId: ids.project } }] })
    await expect(repository.overview(scope, ids.project)).resolves.toHaveProperty('summary')
    await expect(repository.budget(scope, ids.project)).resolves.toHaveProperty('header')
    await expect(repository.ownerAdvances(scope, ids.project, listQuery)).resolves.toHaveProperty('pagination')
    await expect(repository.subcontractors(scope, ids.project)).resolves.toHaveProperty('parties')
    await expect(repository.subcontractor(scope, ids.project, ids.party, paymentQuery)).resolves.toHaveProperty('payments')
    await expect(repository.subcontract(scope, ids.project, ids.contract, paymentQuery)).resolves.toHaveProperty('contract')
    await expect(repository.itemDetails(scope, ids.project, ids.materialsItem, itemQuery)).resolves.toHaveProperty('kind', 'ordinary')
  })

  it('F04 partitions every project-owned relation in a batched factory directory read', async () => {
    const projectA = multiSnapshot(ids.project, 'P-A', 'VND', 'c1070000-0000-4000-8000-000000000140', 'c1070000-0000-4000-8000-000000000141', 'c1070000-0000-4000-8000-000000000142', 'c1070000-0000-4000-8000-000000000143', 'c1070000-0000-4000-8000-000000000144', 'c1070000-0000-4000-8000-000000000145', '100.0000', '100.0000', '10.0000')
    const projectB = multiSnapshot(multiIds.projectB, 'P-B', 'USD', multiIds.itemB, multiIds.partyB, multiIds.contractB, multiIds.budgetB, multiIds.lineB, multiIds.paymentB, '200.0000', '200.0000', '20.0000')
    const projectC = multiSnapshot(multiIds.projectC, 'P-C', 'VND', multiIds.itemC, multiIds.partyC, multiIds.contractC, multiIds.budgetC, multiIds.lineC, multiIds.paymentC, '300.0000', null, '30.0000')
    const db = fakeSupabaseMulti([projectA, projectB, projectC])
    const repository = createSupabaseProjectFinanceRepository(db as never)
    const result = await repository.listProjects(scope, { pageSize: 100 })
    expect(db.contextCalls).toBe(0)
    expect(db.directoryCalls).toBe(1)
    expect(db.stateCalls).toBe(2)
    expect(result.projects.map(project => project.project.projectId)).toEqual([ids.project, multiIds.projectB, multiIds.projectC])
    const byId = new Map(result.projects.map(project => [project.project.projectId, project]))
    expect(byId.get(ids.project)?.summary.ownerAdvances).toMatchObject({ state: 'recorded', amount: '100.0000' })
    expect(byId.get(multiIds.projectB)?.summary.ownerAdvances).toMatchObject({ state: 'recorded', amount: '200.0000' })
    expect(byId.get(multiIds.projectC)?.summary.ownerAdvances).toMatchObject({ state: 'not_recorded', amount: null })
    expect(byId.get(ids.project)?.summary.budget.amount).toBe('100.0000')
    expect(byId.get(multiIds.projectB)?.summary.budget.amount).toBe('200.0000')
    expect(byId.get(multiIds.projectC)?.summary.budget.amount).toBe('300.0000')
    expect(byId.get(ids.project)?.project.currencyCode).toBe('VND')
    expect(byId.get(multiIds.projectB)?.project.currencyCode).toBe('USD')
    expect(byId.get(ids.project)?.summary.warrantyRetention.amount).toBe('10000.0000')
    expect(byId.get(multiIds.projectB)?.summary.warrantyRetention.amount).toBe('10.0000')
    for (const projectId of [ids.project, multiIds.projectB, multiIds.projectC]) {
      const overview = await repository.overview(scope, projectId)
      expect(overview.summary).toEqual(byId.get(projectId)?.summary)
    }
    expect(db.contextCalls).toBe(6)
    expect(db.directoryCalls).toBe(1)
    expect(db.batchProjectQueries.filter(query => query.ids.length === 3).length).toBe(26)
  })

  it('uses only scoped recorded owner advances for management receipts and headline', async () => {
    const projectA = multiSnapshot(ids.project, 'P-A', 'VND', 'c1070000-0000-4000-8000-000000000140', 'c1070000-0000-4000-8000-000000000141', 'c1070000-0000-4000-8000-000000000142', 'c1070000-0000-4000-8000-000000000143', 'c1070000-0000-4000-8000-000000000144', 'c1070000-0000-4000-8000-000000000145', '100.0000', '100.0000', '10.0000')
    const projectB = multiSnapshot(multiIds.projectB, 'P-B', 'USD', multiIds.itemB, multiIds.partyB, multiIds.contractB, multiIds.budgetB, multiIds.lineB, multiIds.paymentB, '200.0000', '200.0000', '20.0000')
    const projectC = multiSnapshot(multiIds.projectC, 'P-C', 'VND', multiIds.itemC, multiIds.partyC, multiIds.contractC, multiIds.budgetC, multiIds.lineC, multiIds.paymentC, '300.0000', null, '30.0000')
    projectB.context.operationalState = 'active'
    projectC.context.operationalState = 'completed'
    projectA.budgets = []
    projectA.budgetLines = []
    projectA.ownerAdvances = [
      { ...projectA.ownerAdvances[0]!, amount_text: '50.0000', source_reference: 'synthetic-book/J3' },
      { ...projectA.ownerAdvances[0]!, id: 'c1070000-0000-4000-8000-000000000146', amount_text: '50.0000', source_reference: 'synthetic-book/J4' },
      { ...projectA.ownerAdvances[0]!, id: 'c1070000-0000-4000-8000-000000000147', amount_text: '999.0000', status: 'voided', source_reference: 'synthetic-book/subtotal' },
    ]
    const db = fakeSupabaseMulti([projectA, projectB, projectC])
    const repository = createSupabaseProjectFinanceRepository(db as never)
    const service = new ProjectFinanceService(repository)
    await expect(service.listProjects({ ...scope, permissions: [] }, { pageSize: 100 })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await expect(service.listProjects({ ...scope, companyId: ids.otherProject }, { pageSize: 100 })).rejects.toMatchObject({ code: 'COMPANY_FORBIDDEN' })
    const result = await repository.listProjects(scope, { pageSize: 100 })
    const byId = new Map(result.projects.map(row => [row.project.projectId, row]))
    expect(byId.get(ids.project)?.summary.management).toMatchObject({
      receipts: { amount: '100.0000', recordedCount: 2, origin: 'canonical_ledger', quality: 'accounting_source_unverified', coverage: 'recorded_rows_only', sourceReferences: ['synthetic-book/J3', 'synthetic-book/J4'] },
      reference: { kind: 'owner_receipts', amount: '100.0000' },
      result: { state: 'unavailable', amount: null, reasons: expect.arrayContaining(['COST_INCOMPLETE']) },
      headline: { kind: 'owner_receipts', amount: '100.0000' },
    })
    expect(byId.get(multiIds.projectB)?.summary.management).toMatchObject({ receipts: { amount: '200.0000', recordedCount: 1 }, reference: { kind: 'approved_budget', amount: '200.0000' } })
    expect(byId.get(multiIds.projectC)?.summary.management).toMatchObject({ receipts: { amount: null, recordedCount: 0, origin: 'none' } })
    expect(byId.get(ids.project)?.project.operationalState).toBe('unknown')
    expect(byId.get(multiIds.projectB)?.project.operationalState).toBe('active')
    expect(byId.get(multiIds.projectC)?.project.operationalState).toBe('completed')
    expect(db.contextCalls).toBe(0)
    for (const projectId of [ids.project, multiIds.projectB, multiIds.projectC]) {
      const overview = await repository.overview(scope, projectId)
      expect(overview.summary.management).toEqual(byId.get(projectId)?.summary.management)
    }
  })

  it.each(['active', 'completed', 'paused', 'unknown'] as const)('preserves the %s lifecycle state without inferring it from finance rows', async operationalState => {
    const rows = readSet()
    rows.context = { ...context, operationalState }
    const result = await concrete(rows).overview(scope, ids.project)
    expect(result.project.operationalState).toBe(operationalState)
  })

  it('computes a provisional negative result without subtracting ordinary retention twice', async () => {
    const rows = readSet()
    rows.categories = [
      category(ids.materials, 'materials', 1),
      category('c1070000-0000-4000-8000-000000000150', 'machinery', 2),
      category('c1070000-0000-4000-8000-000000000151', 'direct_labor', 3),
      category(ids.subcontract, 'subcontract_labor', 4),
      category('c1070000-0000-4000-8000-000000000152', 'other', 5),
    ]
    rows.costItems = [
      item(ids.materialsItem, ids.materials, '25.0000'),
      item('c1070000-0000-4000-8000-000000000153', 'c1070000-0000-4000-8000-000000000150', '25.0000'),
      item('c1070000-0000-4000-8000-000000000154', 'c1070000-0000-4000-8000-000000000151', '25.0000'),
      item('c1070000-0000-4000-8000-000000000155', 'c1070000-0000-4000-8000-000000000152', '25.0000'),
    ]
    rows.details = [detail(ids.detailWarranty, ids.materialsItem, 1, '25.0000', 'warranty', '5.0000', '2026-02-03')]
    rows.budgets = []
    rows.payments = [payment(ids.paymentWarranty, '20.0000', '10.0000')]
    rows.ownerAdvances = [{ id: 'c1070000-0000-4000-8000-000000000156', tenant_id: ids.tenant, company_id: ids.company, project_id: ids.project, amount_text: '100.0000', currency_code: 'VND', status: 'recorded', description: 'Synthetic owner receipt', payer_name: null, receipt_no: null, received_date: '2026-02-01', reference: null, source_reference: 'synthetic/J3', note: null, version: 0, created_at: createdAt, updated_at: createdAt }]
    const repository = createSupabaseProjectFinanceRepository(fakeSupabase(rows) as never)
    const overview = await repository.overview(scope, ids.project)
    expect(overview.summary.cost).toMatchObject({ state: 'recorded', amount: '120.0000' })
    expect(overview.summary.warrantyRetention).toMatchObject({ state: 'recorded', amount: '15.0000' })
    expect(overview.summary.management.result).toEqual({ state: 'provisional', amount: '-30.0000', basis: 'owner_receipts', components: { receipts: '100.0000', cost: '120.0000', independentlyHeldRetention: '10.0000' }, reasons: [] })
    expect(overview.summary.management.headline).toEqual({ kind: 'provisional_result', amount: '-30.0000', basis: 'provisional_owner_receipts_result' })
    expect(overview.summary.margin.amount).toBeNull()
    const directory = await repository.listProjects(scope, directoryQuery)
    expect(directory.projects[0]?.summary.management).toEqual(overview.summary.management)
  })

  it('keeps the documented deterministic date tie-break', () => {
    expect(compareFinanceRows({ effectiveDate: '2026-02-01', createdAt, lineNo: 1, id: ids.detailNoRetention }, { effectiveDate: '2026-02-01', createdAt, lineNo: 2, id: ids.detailWarranty }, 'newest')).toBeLessThan(0)
  })
})
