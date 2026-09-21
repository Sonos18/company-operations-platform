import { deriveFinanceDate, compareFinanceRows } from '../../../../shared/utils/project-finance-dates'
import { financeBudgetSchema, financeItemDetailsSchema, financeOwnerAdvancesSchema, financeProjectListSchema, financeSubcontractDetailSchema, financeSubcontractorDetailSchema, financeSubcontractorListSchema, financeOverviewSchema, type FinanceBudget, type FinanceItemDetails, type FinanceListQuery, type FinanceOwnerAdvances, type FinanceOverview, type FinanceProjectList, type FinanceSubcontractDetail, type FinanceSubcontractorDetail, type FinanceSubcontractorList, type ItemDetailQuery, type PaymentQuery, type ProjectDirectoryQuery } from '../../../../shared/schemas/costs/project-finance'
import { sumFinanceMoney } from '../../../../shared/utils/project-finance-money'
import { AppApiError } from '../../../utils/api-error'
import type { UserSupabaseClient } from '../../../utils/supabase-client'
import { FinanceReadLimitError } from './read-pages'
import { ProjectFinanceMetadataReader, ProjectFinanceTableReader, type FinanceDbClient, type FinanceDirectory, type FinancePartyRow, type FinanceProjectContextRow, type FinanceDetailRow, type FinanceTableRows, type FinanceSummaryTableRows } from './project-finance.queries'
import { paymentTotal, referenceHeadroom, summarizeFinanceRows } from './project-finance.summary'

export type FinanceScope = { actorId?: string, tenantId: string, companyId: string, requestId?: string, permissions?: readonly string[], db?: UserSupabaseClient }
export interface FinanceReadRepository {
  listProjects(scope: FinanceScope, query: ProjectDirectoryQuery): Promise<FinanceProjectList>
  overview(scope: FinanceScope, projectId: string): Promise<FinanceOverview>
  budget(scope: FinanceScope, projectId: string): Promise<FinanceBudget>
  ownerAdvances(scope: FinanceScope, projectId: string, query: FinanceListQuery): Promise<FinanceOwnerAdvances>
  subcontractors(scope: FinanceScope, projectId: string): Promise<FinanceSubcontractorList>
  subcontractor(scope: FinanceScope, projectId: string, partyId: string, query: PaymentQuery): Promise<FinanceSubcontractorDetail>
  subcontract(scope: FinanceScope, projectId: string, subcontractId: string, query: PaymentQuery): Promise<FinanceSubcontractDetail>
  itemDetails(scope: FinanceScope, projectId: string, itemId: string, query: ItemDetailQuery): Promise<FinanceItemDetails>
}

function repositoryError(error: unknown): never {
  if (error instanceof AppApiError) throw error
  if (error instanceof FinanceReadLimitError) throw new AppApiError(500, 'INTERNAL_ERROR', 'Dữ liệu tài chính vượt quá giới hạn đọc.', { reason: 'READ_LIMIT_EXCEEDED' })
  if (error instanceof Error && error.message === 'FINANCE_READ_CURSOR_INVALID') throw new AppApiError(500, 'INTERNAL_ERROR', 'Phân trang dữ liệu tài chính không hợp lệ.', { reason: 'DATA_CONSISTENCY_ERROR' })
  throw error
}

function signature(value: unknown): string { return JSON.stringify(value) }

export class ProjectFinanceReadRepository<T extends { signature: string }> {
  constructor(private readonly source: { read(): Promise<T>, consistent(value: T): boolean | Promise<boolean> }) {}

  async collect(): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const value = await this.source.read()
      if (await this.source.consistent(value)) return value
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new AppApiError(500, 'INTERNAL_ERROR', 'Dữ liệu tài chính đã thay đổi trong khi đọc.', { reason: 'DATA_CONSISTENCY_ERROR' })
  }
}

type ConcreteSource = {
  read(scope: FinanceScope, projectId: string, fullDetails?: boolean): Promise<{ signature: string, readSet: FinanceTableReadSet, consistent: () => Promise<boolean> }>
  directory(scope: FinanceScope, query: ProjectDirectoryQuery): Promise<FinanceDirectory>
  readMany(scope: FinanceScope, projectIds: readonly string[], directory: FinanceDirectory): Promise<{ signature: string, readSets: Map<string, FinanceSummaryTableReadSet>, consistent: () => Promise<boolean> }>
}
type FinanceTableReadSet = FinanceTableRows & { context: FinanceProjectContextRow, parties: readonly FinancePartyRow[] }
type FinanceSummaryTableReadSet = FinanceSummaryTableRows & { context: FinanceProjectContextRow, parties: readonly FinancePartyRow[] }

function page<T>(rows: readonly T[], query: FinanceListQuery, match: (row: T) => boolean, order: (left: T, right: T) => number, amount: (rows: readonly T[]) => string | null) {
  const filtered = rows.filter(match).sort(order)
  const totalPages = Math.max(1, Math.ceil(filtered.length / query.pageSize))
  const currentPage = Math.min(query.page, totalPages)
  const start = (currentPage - 1) * query.pageSize
  return { rows: filtered.slice(start, start + query.pageSize), pagination: { page: currentPage, pageSize: query.pageSize, totalPages, filteredCount: filtered.length, fullCount: rows.length, filteredAmount: amount(filtered), fullAmount: amount(rows) } }
}

function textMatch(query: FinanceListQuery, values: readonly (string | null | undefined)[]) { const q = query.q?.trim().toLocaleLowerCase(); return !q || values.some(value => value?.toLocaleLowerCase().includes(q)) }
function dateMatch(query: FinanceListQuery, effectiveDate: string) { return (!query.dateFrom || effectiveDate >= query.dateFrom) && (!query.dateTo || effectiveDate <= query.dateTo) }
function rowOrder(query: FinanceListQuery) { return (left: { effectiveDate: string, createdAt: string, id: string, lineNo?: number }, right: typeof left) => compareFinanceRows(left, right, query.sort) }
function paymentRetentionMatches(row: { warrantyRetentionAmount: string | null }, retention: PaymentQuery['retention']) {
  if (retention === 'all') return true
  if (retention === 'warranty') return row.warrantyRetentionAmount !== null
  return row.warrantyRetentionAmount === null
}
function detailRetentionMatches(row: { retentionKind: 'warranty' | 'other' | null, retentionAmount: string | null }, retention: ItemDetailQuery['retention']) {
  if (retention === 'all') return true
  if (retention === 'warranty') return row.retentionKind === 'warranty'
  if (retention === 'other') return row.retentionKind === 'other'
  return row.retentionAmount === null
}
function paymentView(payment: FinanceTableRows['payments'][number], contract: FinanceTableRows['subcontracts'][number], timeZone: string) {
  const date = deriveFinanceDate(payment.payment_date, payment.created_at, timeZone)
  return { id: payment.id, contractId: contract.id, contractCode: contract.code, contractNo: contract.contract_no, description: payment.description, paidAmount: sumFinanceMoney([payment.paid_amount_text]), warrantyRetentionAmount: payment.warranty_retention_amount_text === null ? null : sumFinanceMoney([payment.warranty_retention_amount_text]), retentionRateBps: payment.retention_rate_bps, paymentDate: payment.payment_date, effectiveDate: date.effectiveDate, dateSource: date.usedFallback ? 'created_at' as const : 'payment_date' as const, recordStatus: payment.status === 'recorded' ? 'recorded' as const : 'voided' as const, reference: payment.payment_reference, sourceReference: payment.source_reference, note: payment.note, createdAt: payment.created_at, version: payment.version }
}

function paymentPage(rows: readonly ReturnType<typeof paymentView>[], query: PaymentQuery) {
  const visible = rows.filter(row => row.recordStatus === 'recorded').filter(row => paymentRetentionMatches(row, query.retention)).filter(row => textMatch(query, [row.description, row.reference, row.contractCode, row.contractNo, row.note])).filter(row => dateMatch(query, row.effectiveDate))
  const full = rows.filter(row => row.recordStatus === 'recorded')
  const selected = page(full, query, row => visible.includes(row), rowOrder(query), values => values.length === 0 ? '0.0000' : sumFinanceMoney(values.map(row => row.paidAmount)))
  const total = paymentTotal(full.map(row => ({ paid_amount_text: row.paidAmount, warranty_retention_amount_text: row.warrantyRetentionAmount, status: row.recordStatus })))
  return { rows: selected.rows, pagination: { ...selected.pagination, fullCount: full.length, fullAmount: total.amount }, recordedTotal: total.amount, recordedCount: total.count, recordedRetentionTotal: total.retentionAmount, recordedRetentionRowCount: total.retentionCount }
}

function contractSummary(contract: FinanceTableRows['subcontracts'][number], payments: readonly FinanceTableRows['payments'][number][]) {
  const total = paymentTotal(payments)
  return { id: contract.id, code: contract.code, contractNo: contract.contract_no, contractName: contract.contract_name, contractDate: contract.contract_date, contractValue: contract.contract_value_text === null ? null : sumFinanceMoney([contract.contract_value_text]), currencyCode: contract.currency_code, defaultRetentionRateBps: contract.warranty_retention_rate_bps, isActive: contract.is_active, version: contract.version, paidTotal: total.amount, paidCount: total.count, recordedRetentionTotal: total.retentionAmount, recordedRetentionRowCount: total.retentionCount }
}

function findParty(readSet: FinanceTableReadSet, partyId: string) { const party = readSet.parties.find(value => value.partyId === partyId); if (!party) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy nhà thầu.'); return party }
function findContract(readSet: FinanceTableReadSet, contractId: string) { const contract = readSet.subcontracts.find(value => value.id === contractId); if (!contract) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy hợp đồng.'); return contract }

export class ConcreteProjectFinanceRepository implements FinanceReadRepository {
  constructor(private readonly source: ConcreteSource) {}

  private async read(scope: FinanceScope, projectId: string, fullDetails = false) {
    try {
      const retry = new ProjectFinanceReadRepository({ read: () => this.source.read(scope, projectId, fullDetails), consistent: value => value.consistent() })
      return (await retry.collect()).readSet
    } catch (error) { return repositoryError(error) }
  }

  async listProjects(scope: FinanceScope, query: ProjectDirectoryQuery) {
    const directory = await this.source.directory(scope, query)
    try {
      const retry = new ProjectFinanceReadRepository({ read: () => this.source.readMany(scope, directory.projects.map(project => project.projectId), directory), consistent: value => value.consistent() })
      const { readSets } = await retry.collect()
      const projects = directory.projects.map(project => {
        const readSet = readSets.get(project.projectId)
        if (!readSet) throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc dữ liệu tài chính của dự án.')
        const overview = summarizeFinanceRows({ context: { ...readSet.context, projectCode: project.projectCode, projectName: project.projectName }, rows: readSet })
        return { project: overview.project, summary: overview.summary }
      })
      return financeProjectListSchema.parse({ schemaVersion: 1, projects, nextCursor: directory.nextCursor })
    } catch (error) { return repositoryError(error) }
  }

  async overview(scope: FinanceScope, projectId: string) { const readSet = await this.read(scope, projectId); return financeOverviewSchema.parse(summarizeFinanceRows({ context: readSet.context, rows: readSet })) }

  async budget(scope: FinanceScope, projectId: string) {
    const readSet = await this.read(scope, projectId, true)
    const project = financeOverviewSchema.parse(summarizeFinanceRows({ context: readSet.context, rows: readSet })).project
    const approved = readSet.budgets.filter(row => row.status === 'approved')[0] ?? null
    if (!approved) return financeBudgetSchema.parse({ schemaVersion: 1, project, state: 'not_recorded', header: null, lines: [] })
    const lines = approved.detail_mode === 'categorized' ? readSet.budgetLines.filter(line => line.budget_version_id === approved.id) : []
    return financeBudgetSchema.parse({
      schemaVersion: 1, project, state: 'approved',
      header: { id: approved.id, revisionNo: approved.revision_no, name: approved.name, detailMode: approved.detail_mode, amount: sumFinanceMoney([approved.total_amount_text]), currencyCode: approved.currency_code, effectiveDate: approved.effective_date, approvedAt: approved.approved_at, reference: approved.reference, sourceReference: approved.source_reference, note: approved.note, version: approved.version },
      lines: lines.map(line => ({ id: line.id, categoryId: line.cost_category_id, lineNo: line.line_no, description: line.description, amount: sumFinanceMoney([line.amount_text]), reference: line.reference, sourceReference: line.source_reference, note: line.note, version: line.version })),
    })
  }

  async ownerAdvances(scope: FinanceScope, projectId: string, query: FinanceListQuery) {
    const readSet = await this.read(scope, projectId, true)
    const overview = summarizeFinanceRows({ context: readSet.context, rows: readSet })
    const all = readSet.ownerAdvances.map(row => { const derived = deriveFinanceDate(row.received_date, row.created_at, readSet.context.timeZone); return { id: row.id, description: row.description, amount: sumFinanceMoney([row.amount_text]), payerName: row.payer_name, receiptNo: row.receipt_no, receivedDate: row.received_date, effectiveDate: derived.effectiveDate, dateSource: derived.usedFallback ? 'created_at' as const : 'received_date' as const, recordStatus: row.status === 'recorded' ? 'recorded' as const : 'voided' as const, reference: row.reference, sourceReference: row.source_reference, note: row.note, createdAt: row.created_at, version: row.version } })
    const recorded = all.filter(row => row.recordStatus === 'recorded')
    const selected = page(recorded, query, row => textMatch(query, [row.description, row.payerName, row.receiptNo, row.reference, row.note]) && dateMatch(query, row.effectiveDate), rowOrder(query), values => values.length === 0 ? '0.0000' : sumFinanceMoney(values.map(row => row.amount)))
    const fullAmount = recorded.length === 0 ? '0.0000' : sumFinanceMoney(recorded.map(row => row.amount))
    const filteredAmount = selected.pagination.filteredAmount
    return financeOwnerAdvancesSchema.parse({ schemaVersion: 1, project: overview.project, recordedTotal: fullAmount, recordedCount: recorded.length, ownerAdvance: overview.summary.ownerAdvances, filtered: { amount: filteredAmount, count: selected.pagination.filteredCount }, rows: selected.rows, pagination: { ...selected.pagination, fullCount: recorded.length, fullAmount } })
  }

  async subcontractors(scope: FinanceScope, projectId: string) {
    const readSet = await this.read(scope, projectId)
    const overview = summarizeFinanceRows({ context: readSet.context, rows: readSet })
    const grouped = new Map<string, FinanceTableRows['subcontracts']>()
    for (const contract of readSet.subcontracts) grouped.set(contract.subcontractor_party_id, [...(grouped.get(contract.subcontractor_party_id) ?? []), contract])
    const parties = [...grouped.entries()].map(([partyId, contracts]) => ({ party: findParty(readSet, partyId), contracts: contracts.map(contract => contractSummary(contract, readSet.payments.filter(payment => payment.project_subcontract_id === contract.id))) }))
    const legacy = overview.categories.some(category => category.code === 'subcontract_labor' && category.legacyReconciliationRequired)
    const coverage = legacy ? 'needs_reconciliation' : readSet.subcontracts.length === 0 && readSet.payments.length === 0 ? 'not_recorded' : 'recorded'
    return financeSubcontractorListSchema.parse({ schemaVersion: 1, project: overview.project, coverage, parties })
  }

  async subcontractor(scope: FinanceScope, projectId: string, partyId: string, query: PaymentQuery) {
    const readSet = await this.read(scope, projectId, true)
    const overview = summarizeFinanceRows({ context: readSet.context, rows: readSet })
    const party = findParty(readSet, partyId)
    const contracts = readSet.subcontracts.filter(contract => contract.subcontractor_party_id === partyId)
    if (contracts.length === 0) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy nhà thầu.')
    const contractIds = new Set(contracts.map(contract => contract.id))
    const paymentRows = readSet.payments.filter(payment => contractIds.has(payment.project_subcontract_id)).map(payment => paymentView(payment, readSet.subcontracts.find(contract => contract.id === payment.project_subcontract_id)!, readSet.context.timeZone))
    return financeSubcontractorDetailSchema.parse({ schemaVersion: 1, project: overview.project, party, contracts: contracts.map(contract => contractSummary(contract, readSet.payments.filter(payment => payment.project_subcontract_id === contract.id))), payments: paymentPage(paymentRows, query) })
  }

  async subcontract(scope: FinanceScope, projectId: string, subcontractId: string, query: PaymentQuery) {
    const readSet = await this.read(scope, projectId, true)
    const overview = summarizeFinanceRows({ context: readSet.context, rows: readSet })
    const contract = findContract(readSet, subcontractId)
    const party = findParty(readSet, contract.subcontractor_party_id)
    const paymentRows = readSet.payments.filter(payment => payment.project_subcontract_id === contract.id).map(payment => paymentView(payment, contract, readSet.context.timeZone))
    return financeSubcontractDetailSchema.parse({
      schemaVersion: 1, project: overview.project, party,
      contract: { ...contractSummary(contract, readSet.payments.filter(payment => payment.project_subcontract_id === contract.id)), reference: contract.reference, sourceReference: contract.source_reference, note: contract.note, referenceHeadroom: referenceHeadroom(contract.contract_value_text, readSet.payments.filter(payment => payment.project_subcontract_id === contract.id)).value, referenceHeadroomReason: referenceHeadroom(contract.contract_value_text, readSet.payments.filter(payment => payment.project_subcontract_id === contract.id)).reason },
      payments: paymentPage(paymentRows, query),
    })
  }

  async itemDetails(scope: FinanceScope, projectId: string, itemId: string, query: ItemDetailQuery) {
    const readSet = await this.read(scope, projectId, true)
    const overview = summarizeFinanceRows({ context: readSet.context, rows: readSet })
    const item = readSet.costItems.find(value => value.id === itemId)
    if (!item) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy Project Cost.')
    const category = overview.categories.find(value => value.categoryId === item.cost_category_id)
    if (!category) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy Project Cost.')
    const details = readSet.details.filter(detail => detail.project_cost_item_id === item.id) as unknown as FinanceDetailRow[]
    if (category.code === 'subcontract_labor' && (details.length > 0 || !/^0(?:\.0*)?$/.test(item.amount_text))) return financeItemDetailsSchema.parse({ schemaVersion: 1, kind: 'legacy_subcontract', project: overview.project, category, item: { id: item.id, description: item.description, businessReference: item.business_reference, parentAmount: sumFinanceMoney([item.amount_text]), currencyCode: item.currency_code, version: item.version }, reason: 'LEGACY_SUBCONTRACT_RECONCILIATION_REQUIRED' })
    const rows = details.map(detail => { const derived = deriveFinanceDate(detail.relevant_date, detail.created_at, readSet.context.timeZone); return { id: detail.id, lineNo: detail.line_no, detailKind: detail.detail_kind, description: detail.description, quantity: detail.quantity_text, unitCode: detail.unit_code, unitPrice: detail.unit_price_text, amount: sumFinanceMoney([detail.amount_text]), retentionKind: detail.retention_kind, retentionRateBps: detail.retention_rate_bps, retentionAmount: detail.retention_amount_text === null ? null : sumFinanceMoney([detail.retention_amount_text]), relevantDate: detail.relevant_date, effectiveDate: derived.effectiveDate, dateSource: derived.usedFallback ? 'created_at' as const : 'relevant_date' as const, reference: detail.reference, note: detail.note, createdAt: detail.created_at, version: detail.version } })
    const selected = page(rows, query, row => textMatch(query, [row.description, row.reference, row.note]) && dateMatch(query, row.effectiveDate) && detailRetentionMatches(row, query.retention), rowOrder(query), values => values.length === 0 ? '0.0000' : sumFinanceMoney(values.map(row => row.amount)))
    return financeItemDetailsSchema.parse({ schemaVersion: 1, kind: 'ordinary', project: overview.project, category, item: { id: item.id, description: item.description, businessReference: item.business_reference, parentAmount: sumFinanceMoney([item.amount_text]), currencyCode: item.currency_code, version: item.version }, details: { rows: selected.rows, pagination: { ...selected.pagination, fullAmount: rows.length === 0 ? '0.0000' : sumFinanceMoney(rows.map(row => row.amount)) } } })
  }
}

async function readSet(metadata: ProjectFinanceMetadataReader, tables: ProjectFinanceTableReader, scope: FinanceScope, projectId: string, fullDetails = false): Promise<FinanceTableReadSet> {
  const context = await metadata.context(scope.companyId, projectId)
  const [categories, costItems, budgets, budgetLines, ownerAdvances, subcontracts, payments] = await Promise.all([
    tables.categories(scope.tenantId, scope.companyId), tables.costItems(scope.tenantId, scope.companyId, projectId), tables.budgets(scope.tenantId, scope.companyId, projectId, fullDetails), tables.budgetLines(scope.tenantId, scope.companyId, projectId, fullDetails), tables.ownerAdvances(scope.tenantId, scope.companyId, projectId, fullDetails), tables.subcontracts(scope.tenantId, scope.companyId, projectId, fullDetails), tables.payments(scope.tenantId, scope.companyId, projectId, fullDetails),
  ])
  const details = await (fullDetails ? tables.details(scope.tenantId, scope.companyId, costItems.map(item => item.id)) : tables.detailAggregates(scope.tenantId, scope.companyId, costItems.map(item => item.id)))
  const partyIds = [...new Set(subcontracts.map(contract => contract.subcontractor_party_id))]
  const parties: FinancePartyRow[] = []
  for (let index = 0; index < partyIds.length; index += 50) parties.push(...await metadata.parties(scope.companyId, projectId, partyIds.slice(index, index + 50)))
  return { context, categories, costItems, details, budgets: budgets as FinanceTableRows['budgets'], budgetLines: budgetLines as FinanceTableRows['budgetLines'], ownerAdvances: ownerAdvances as FinanceTableRows['ownerAdvances'], subcontracts: subcontracts as FinanceTableRows['subcontracts'], payments: payments as FinanceTableRows['payments'], parties }
}

function coherent(readSet: FinanceSummaryTableReadSet): boolean {
  const detailsByItem = new Map<string, typeof readSet.details>()
  for (const detail of readSet.details) detailsByItem.set(detail.project_cost_item_id, [...(detailsByItem.get(detail.project_cost_item_id) ?? []), detail])
  for (const item of readSet.costItems) {
    const details = detailsByItem.get(item.id) ?? []
    if (details.length > 0 && sumFinanceMoney(details.map(detail => detail.amount_text)) !== sumFinanceMoney([item.amount_text])) return false
  }
  for (const budget of readSet.budgets.filter(row => row.status === 'approved' && row.detail_mode === 'categorized')) {
    const lines = readSet.budgetLines.filter(line => line.budget_version_id === budget.id)
    if (sumFinanceMoney(lines.map(line => line.amount_text)) !== sumFinanceMoney([budget.total_amount_text])) return false
  }
  return readSet.payments.every(payment => {
    const contract = readSet.subcontracts.find(value => value.id === payment.project_subcontract_id)
    return contract !== undefined && contract.project_id === payment.project_id && contract.currency_code === payment.currency_code
  })
}

function groupByKey<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row])
  return grouped
}

async function collectMany(metadata: ProjectFinanceMetadataReader, tables: ProjectFinanceTableReader, scope: FinanceScope, projectIds: readonly string[], directory: FinanceDirectory): Promise<Map<string, FinanceSummaryTableReadSet>> {
  if (projectIds.length === 0) return new Map()
  const [categories, costItems, budgets, budgetLines, ownerAdvances, subcontracts, payments] = await Promise.all([
    tables.categories(scope.tenantId, scope.companyId), tables.costItemsForProjects(scope.tenantId, scope.companyId, projectIds), tables.budgetsForProjects(scope.tenantId, scope.companyId, projectIds, false), tables.budgetLinesForProjects(scope.tenantId, scope.companyId, projectIds, false), tables.ownerAdvancesForProjects(scope.tenantId, scope.companyId, projectIds, false), tables.subcontractsForProjects(scope.tenantId, scope.companyId, projectIds, false), tables.paymentsForProjects(scope.tenantId, scope.companyId, projectIds, false),
  ])
  const details = await tables.detailAggregates(scope.tenantId, scope.companyId, costItems.map(item => item.id))
  const operationalStates = await metadata.operationalStates(scope.companyId, projectIds)
  const costItemsByProject = groupByKey(costItems, row => row.project_id)
  const detailsByItem = groupByKey(details, row => row.project_cost_item_id)
  const budgetsByProject = groupByKey(budgets, row => row.project_id)
  const budgetLinesByProject = groupByKey(budgetLines, row => row.project_id)
  const ownerAdvancesByProject = groupByKey(ownerAdvances, row => row.project_id)
  const subcontractsByProject = groupByKey(subcontracts, row => row.project_id)
  const paymentsByProject = groupByKey(payments, row => row.project_id)
  const result = new Map<string, FinanceSummaryTableReadSet>()
  for (const project of directory.projects) {
    const scopedCostItems = costItemsByProject.get(project.projectId) ?? []
    const scopedDetails = scopedCostItems.flatMap(item => detailsByItem.get(item.id) ?? [])
    const scopedContracts = subcontractsByProject.get(project.projectId) ?? []
    const partyIds = [...new Set(scopedContracts.map(contract => contract.subcontractor_party_id))]
    const parties: FinancePartyRow[] = []
    for (let index = 0; index < partyIds.length; index += 50) parties.push(...await metadata.parties(scope.companyId, project.projectId, partyIds.slice(index, index + 50)))
    result.set(project.projectId, { context: { projectId: project.projectId, projectCode: project.projectCode, projectName: project.projectName, defaultCurrencyCode: directory.defaultCurrencyCode, moneyScale: directory.moneyScale, timeZone: directory.timeZone, operationalState: operationalStates.get(project.projectId)! }, categories, costItems: scopedCostItems, details: scopedDetails, budgets: budgetsByProject.get(project.projectId) ?? [], budgetLines: budgetLinesByProject.get(project.projectId) ?? [], ownerAdvances: ownerAdvancesByProject.get(project.projectId) ?? [], subcontracts: scopedContracts, payments: paymentsByProject.get(project.projectId) ?? [], parties })
  }
  return result
}

export function createSupabaseProjectFinanceRepository(db: UserSupabaseClient): FinanceReadRepository {
  const client = db as unknown as FinanceDbClient
  const metadata = new ProjectFinanceMetadataReader(client)
  const tables = new ProjectFinanceTableReader(client)
  const source: ConcreteSource = {
    async read(scope, projectId, fullDetails = false) {
      const value = await readSet(metadata, tables, scope, projectId, fullDetails)
      const expected = signature(value)
      return { signature: expected, readSet: value, consistent: async () => {
        const current = await readSet(metadata, tables, scope, projectId, fullDetails)
        return coherent(value) && signature(current) === expected && coherent(current)
      } }
    },
    directory: (scope, query) => metadata.directory(scope.companyId, query.afterId ?? null, query.pageSize),
    async readMany(scope, projectIds, directory) {
      const collect = () => collectMany(metadata, tables, scope, projectIds, directory)
      const readSets = await collect()
      const expected = signature([...readSets.entries()])
      return {
        signature: expected,
        readSets,
        consistent: async () => {
          const current = await collect()
          return [...readSets.values()].every(coherent) && [...current.values()].every(coherent) && signature([...current.entries()]) === expected
        },
      }
    },
  }
  return new ConcreteProjectFinanceRepository(source)
}
