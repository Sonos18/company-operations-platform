import { deriveFinanceDate, compareFinanceRows } from '../../../../shared/utils/project-finance-dates'
import { financeBudgetSchema, financeItemDetailsSchema, financeOwnerAdvancesSchema, financeProjectListSchema, financeSubcontractDetailSchema, financeSubcontractorDetailSchema, financeSubcontractorListSchema, financeOverviewSchema, type FinanceBudget, type FinanceItemDetails, type FinanceListQuery, type FinanceOwnerAdvances, type FinanceOverview, type FinanceProjectList, type FinanceSubcontractDetail, type FinanceSubcontractorDetail, type FinanceSubcontractorList, type ItemDetailQuery, type PaymentQuery, type ProjectDirectoryQuery } from '../../../../shared/schemas/costs/project-finance'
import { sumFinanceMoney } from '../../../../shared/utils/project-finance-money'
import { AppApiError } from '../../../utils/api-error'
import type { UserSupabaseClient } from '../../../utils/supabase-client'
import { FinanceReadLimitError } from './read-pages'
import { ProjectFinanceMetadataReader, ProjectFinanceTableReader, type FinanceDbClient, type FinanceDirectory, type FinancePartyRow, type FinanceProjectContextRow, type FinanceDetailRow, type FinanceTableRows } from './project-finance.queries'
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

export type FinanceReadSet = {
  categories: readonly { id: string, code: string, name?: string, display_order?: number, is_active?: boolean }[]
  costItems: readonly { id: string, cost_category_id: string | null, amount_text: string, description?: string, business_reference?: string | null, currency_code?: string, relevant_date?: string | null, version?: number, created_at?: string, updated_at?: string }[]
  details: readonly { id?: string, project_cost_item_id: string, amount_text?: string, retention_kind?: string | null, retention_amount_text?: string | null, relevant_date?: string | null, created_at?: string, updated_at?: string, version?: number }[]
  budgets: readonly { id?: string, status: string, total_amount_text: string, currency_code?: string, project_id?: string }[]
  budgetLines?: readonly unknown[]
  ownerAdvances: readonly { status: string, amount_text: string }[]
  subcontracts: readonly unknown[]
  payments: readonly { status: 'recorded' | 'voided', paid_amount_text: string, warranty_retention_amount_text: string | null }[]
  context?: FinanceProjectContextRow
  parties?: readonly FinancePartyRow[]
}

function repositoryError(error: unknown): never {
  if (error instanceof AppApiError) throw error
  if (error instanceof FinanceReadLimitError) throw new AppApiError(500, 'INTERNAL_ERROR', 'Dữ liệu tài chính vượt quá giới hạn đọc.', { reason: 'READ_LIMIT_EXCEEDED' })
  if (error instanceof Error && error.message === 'FINANCE_READ_CURSOR_INVALID') throw new AppApiError(500, 'INTERNAL_ERROR', 'Phân trang dữ liệu tài chính không hợp lệ.', { reason: 'DATA_CONSISTENCY_ERROR' })
  throw error
}

function signature(value: unknown): string { return JSON.stringify(value) }

export function summarizeFinanceReadSet(readSet: FinanceReadSet) {
  const categoryById = new Map(readSet.categories.map(category => [category.id, category.code]))
  const unmapped = readSet.costItems.some(item => item.cost_category_id === null || !categoryById.has(item.cost_category_id))
  const legacySubcontract = readSet.costItems.some(item => item.cost_category_id !== null && categoryById.get(item.cost_category_id) === 'subcontract_labor' && ((!/^0(?:\.0*)?$/.test(item.amount_text)) || readSet.details.some(detail => detail.project_cost_item_id === item.id)))
  const ordinary = readSet.costItems.filter(item => item.cost_category_id !== null && categoryById.get(item.cost_category_id) !== 'subcontract_labor').map(item => item.amount_text)
  return summarizeFinanceReadSetLegacy({
    ordinaryAmounts: ordinary,
    recordedPayments: readSet.payments.map(payment => ({ paidAmount: payment.paid_amount_text, retentionAmount: payment.warranty_retention_amount_text, status: payment.status })),
    legacySubcontractHasData: legacySubcontract,
    hasUnmappedParent: unmapped,
    approvedBudget: readSet.budgets.find(budget => budget.status === 'approved')?.total_amount_text ?? null,
    ownerAdvanceAmounts: readSet.ownerAdvances.filter(advance => advance.status === 'recorded').map(advance => advance.amount_text),
  })
}

function summarizeFinanceReadSetLegacy(input: Parameters<typeof summarizeFinanceReadSetLegacyInput>[0]) { return summarizeFinanceReadSetLegacyInput(input) }
function summarizeFinanceReadSetLegacyInput(input: { ordinaryAmounts: readonly string[], recordedPayments: readonly { paidAmount: string, retentionAmount: string | null, status: 'recorded' | 'voided' }[], legacySubcontractHasData: boolean, hasUnmappedParent: boolean, approvedBudget: string | null, ownerAdvanceAmounts: readonly string[] }) {
  const payments = input.recordedPayments.filter(payment => payment.status === 'recorded')
  const retention = payments.flatMap(payment => payment.retentionAmount === null ? [] : [payment.retentionAmount])
  const knownSubtotal = sumFinanceMoney(input.ordinaryAmounts)
  const costState = input.hasUnmappedParent || input.legacySubcontractHasData ? 'needs_reconciliation' : input.ordinaryAmounts.length === 0 ? 'not_recorded' : 'recorded'
  return {
    cost: { state: costState, amount: costState === 'recorded' ? knownSubtotal : null, recordedCount: input.ordinaryAmounts.length, knownSubtotal },
    recordedPaymentsTotal: sumFinanceMoney(payments.map(payment => payment.paidAmount)),
    warrantyRetention: retention.length === 0 ? { state: 'not_recorded' as const, amount: null, recordedCount: 0 } : { state: 'recorded' as const, amount: sumFinanceMoney(retention), recordedCount: retention.length },
    issues: [...(input.hasUnmappedParent ? [{ code: 'UNMAPPED_COST_ITEM' as const, categoryId: null }] : []), ...(input.legacySubcontractHasData ? [{ code: 'LEGACY_SUBCONTRACT_RECONCILIATION_REQUIRED' as const, categoryId: null }] : [])],
  }
}

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
  readMany(scope: FinanceScope, projectIds: readonly string[], directory: FinanceDirectory): Promise<Map<string, FinanceTableReadSet>>
}
type FinanceTableReadSet = FinanceTableRows & { context: FinanceProjectContextRow, parties: readonly FinancePartyRow[] }

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
function paymentView(payment: FinanceTableRows['payments'][number], contract: FinanceTableRows['subcontracts'][number], timeZone: string) {
  const date = deriveFinanceDate(payment.payment_date, payment.created_at, timeZone)
  return { id: payment.id, contractId: contract.id, contractCode: contract.code, contractNo: contract.contract_no, description: payment.description, paidAmount: sumFinanceMoney([payment.paid_amount_text]), warrantyRetentionAmount: payment.warranty_retention_amount_text === null ? null : sumFinanceMoney([payment.warranty_retention_amount_text]), retentionRateBps: payment.retention_rate_bps, paymentDate: payment.payment_date, effectiveDate: date.effectiveDate, dateSource: date.usedFallback ? 'created_at' as const : 'business_date' as const, recordStatus: payment.status === 'recorded' ? 'recorded' as const : 'voided' as const, reference: payment.payment_reference, sourceReference: payment.source_reference, note: payment.note, createdAt: payment.created_at, version: payment.version }
}

function paymentPage(rows: readonly ReturnType<typeof paymentView>[], query: PaymentQuery) {
  const visible = rows.filter(row => row.recordStatus === 'recorded').filter(row => query.retention === 'all' || query.retention === 'warranty' ? row.warrantyRetentionAmount !== null : row.warrantyRetentionAmount === null).filter(row => textMatch(query, [row.description, row.reference, row.contractCode, row.contractNo, row.note])).filter(row => dateMatch(query, row.effectiveDate))
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

export class ConnectedProjectFinanceRepository {
  private readonly retry: ProjectFinanceReadRepository<{ signature: string, readSet: FinanceReadSet }>

  constructor(source: { read(): Promise<{ signature: string, readSet: FinanceReadSet }>, consistent(value: { signature: string, readSet: FinanceReadSet }): boolean | Promise<boolean> }) {
    this.retry = new ProjectFinanceReadRepository(source)
  }

  async overview(scope?: FinanceScope, projectId?: string) {
    const value = await this.retry.collect()
    if (scope && projectId && value.readSet.context && 'categories' in value.readSet && 'costItems' in value.readSet) {
      return financeOverviewSchema.parse(summarizeFinanceRows({ context: value.readSet.context, rows: value.readSet as unknown as FinanceTableRows }))
    }
    return summarizeFinanceReadSet(value.readSet)
  }

  listProjects(): Promise<FinanceProjectList> { throw new AppApiError(500, 'INTERNAL_ERROR', 'Finance reader is unavailable.') }
  budget(): Promise<FinanceBudget> { throw new AppApiError(500, 'INTERNAL_ERROR', 'Finance reader is unavailable.') }
  ownerAdvances(): Promise<FinanceOwnerAdvances> { throw new AppApiError(500, 'INTERNAL_ERROR', 'Finance reader is unavailable.') }
  subcontractors(): Promise<FinanceSubcontractorList> { throw new AppApiError(500, 'INTERNAL_ERROR', 'Finance reader is unavailable.') }
  subcontractor(): Promise<FinanceSubcontractorDetail> { throw new AppApiError(500, 'INTERNAL_ERROR', 'Finance reader is unavailable.') }
  subcontract(): Promise<FinanceSubcontractDetail> { throw new AppApiError(500, 'INTERNAL_ERROR', 'Finance reader is unavailable.') }
  itemDetails(): Promise<FinanceItemDetails> { throw new AppApiError(500, 'INTERNAL_ERROR', 'Finance reader is unavailable.') }
}

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
    const readSets = await this.source.readMany(scope, directory.projects.map(project => project.projectId), directory)
    const projects = directory.projects.map(project => {
      const readSet = readSets.get(project.projectId)
      if (!readSet) throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc dữ liệu tài chính của dự án.')
      const overview = summarizeFinanceRows({ context: { ...readSet.context, projectCode: project.projectCode, projectName: project.projectName }, rows: readSet })
      return { project: overview.project, summary: overview.summary }
    })
    return financeProjectListSchema.parse({ schemaVersion: 1, projects, nextCursor: directory.nextCursor })
  }

  async overview(scope: FinanceScope, projectId: string) { const readSet = await this.read(scope, projectId); return financeOverviewSchema.parse(summarizeFinanceRows({ context: readSet.context, rows: readSet })) }

  async budget(scope: FinanceScope, projectId: string) {
    const readSet = await this.read(scope, projectId)
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
    const readSet = await this.read(scope, projectId)
    const overview = summarizeFinanceRows({ context: readSet.context, rows: readSet })
    const all = readSet.ownerAdvances.map(row => { const derived = deriveFinanceDate(row.received_date, row.created_at, readSet.context.timeZone); return { id: row.id, description: row.description, amount: sumFinanceMoney([row.amount_text]), payerName: row.payer_name, receiptNo: row.receipt_no, receivedDate: row.received_date, effectiveDate: derived.effectiveDate, dateSource: derived.usedFallback ? 'created_at' as const : 'business_date' as const, recordStatus: row.status === 'recorded' ? 'recorded' as const : 'voided' as const, reference: row.reference, sourceReference: row.source_reference, note: row.note, createdAt: row.created_at, version: row.version } })
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
    const readSet = await this.read(scope, projectId)
    const overview = summarizeFinanceRows({ context: readSet.context, rows: readSet })
    const party = findParty(readSet, partyId)
    const contracts = readSet.subcontracts.filter(contract => contract.subcontractor_party_id === partyId)
    if (contracts.length === 0) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy nhà thầu.')
    const contractIds = new Set(contracts.map(contract => contract.id))
    const paymentRows = readSet.payments.filter(payment => contractIds.has(payment.project_subcontract_id)).map(payment => paymentView(payment, readSet.subcontracts.find(contract => contract.id === payment.project_subcontract_id)!, readSet.context.timeZone))
    return financeSubcontractorDetailSchema.parse({ schemaVersion: 1, project: overview.project, party, contracts: contracts.map(contract => contractSummary(contract, readSet.payments.filter(payment => payment.project_subcontract_id === contract.id))), payments: paymentPage(paymentRows, query) })
  }

  async subcontract(scope: FinanceScope, projectId: string, subcontractId: string, query: PaymentQuery) {
    const readSet = await this.read(scope, projectId)
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
    const selected = page(rows, query, row => textMatch(query, [row.description, row.reference, row.note]) && dateMatch(query, row.effectiveDate) && (query.retention === 'all' || query.retention === 'warranty' ? row.retentionKind === 'warranty' : query.retention === 'other' ? row.retentionKind === 'other' : row.retentionAmount === null), rowOrder(query), values => values.length === 0 ? '0.0000' : sumFinanceMoney(values.map(row => row.amount)))
    return financeItemDetailsSchema.parse({ schemaVersion: 1, kind: 'ordinary', project: overview.project, category, item: { id: item.id, description: item.description, businessReference: item.business_reference, parentAmount: sumFinanceMoney([item.amount_text]), currencyCode: item.currency_code, version: item.version }, details: { rows: selected.rows, pagination: { ...selected.pagination, fullAmount: rows.length === 0 ? '0.0000' : sumFinanceMoney(rows.map(row => row.amount)) } } })
  }
}

async function readSet(metadata: ProjectFinanceMetadataReader, tables: ProjectFinanceTableReader, scope: FinanceScope, projectId: string, fullDetails = false): Promise<FinanceTableReadSet> {
  const context = await metadata.context(scope.companyId, projectId)
  const [categories, costItems, budgets, budgetLines, ownerAdvances, subcontracts, payments] = await Promise.all([
    tables.categories(scope.tenantId, scope.companyId), tables.costItems(scope.tenantId, scope.companyId, projectId), tables.budgets(scope.tenantId, scope.companyId, projectId), tables.budgetLines(scope.tenantId, scope.companyId, projectId), tables.ownerAdvances(scope.tenantId, scope.companyId, projectId), tables.subcontracts(scope.tenantId, scope.companyId, projectId), tables.payments(scope.tenantId, scope.companyId, projectId),
  ])
  const details = await (fullDetails ? tables.details(scope.tenantId, scope.companyId, costItems.map(item => item.id)) : tables.detailAggregates(scope.tenantId, scope.companyId, costItems.map(item => item.id)))
  const partyIds = [...new Set(subcontracts.map(contract => contract.subcontractor_party_id))]
  const parties: FinancePartyRow[] = []
  for (let index = 0; index < partyIds.length; index += 50) parties.push(...await metadata.parties(scope.companyId, projectId, partyIds.slice(index, index + 50)))
  return { context, categories, costItems, details, budgets, budgetLines, ownerAdvances, subcontracts, payments, parties }
}

function coherent(readSet: FinanceTableReadSet): boolean {
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

async function readMany(metadata: ProjectFinanceMetadataReader, tables: ProjectFinanceTableReader, scope: FinanceScope, projectIds: readonly string[], directory: FinanceDirectory): Promise<Map<string, FinanceTableReadSet>> {
  if (projectIds.length === 0) return new Map()
  const [categories, costItems, budgets, budgetLines, ownerAdvances, subcontracts, payments] = await Promise.all([
    tables.categories(scope.tenantId, scope.companyId), tables.costItemsForProjects(scope.tenantId, scope.companyId, projectIds), tables.budgetsForProjects(scope.tenantId, scope.companyId, projectIds), tables.budgetLinesForProjects(scope.tenantId, scope.companyId, projectIds), tables.ownerAdvancesForProjects(scope.tenantId, scope.companyId, projectIds), tables.subcontractsForProjects(scope.tenantId, scope.companyId, projectIds), tables.paymentsForProjects(scope.tenantId, scope.companyId, projectIds),
  ])
  const details = await tables.detailAggregates(scope.tenantId, scope.companyId, costItems.map(item => item.id))
  const result = new Map<string, FinanceTableReadSet>()
  for (const project of directory.projects) {
    const scopedContracts = subcontracts.filter(row => row.project_id === project.projectId)
    const partyIds = [...new Set(scopedContracts.map(contract => contract.subcontractor_party_id))]
    const parties: FinancePartyRow[] = []
    for (let index = 0; index < partyIds.length; index += 50) parties.push(...await metadata.parties(scope.companyId, project.projectId, partyIds.slice(index, index + 50)))
    result.set(project.projectId, { context: { projectId: project.projectId, projectCode: project.projectCode, projectName: project.projectName, defaultCurrencyCode: directory.defaultCurrencyCode, moneyScale: directory.moneyScale, timeZone: directory.timeZone }, categories, costItems: costItems.filter(row => row.project_id === project.projectId), details: details.filter(row => costItems.some(item => item.project_id === project.projectId && item.id === row.project_cost_item_id)), budgets: budgets.filter(row => row.project_id === project.projectId), budgetLines: budgetLines.filter(row => row.project_id === project.projectId), ownerAdvances: ownerAdvances.filter(row => row.project_id === project.projectId), subcontracts: scopedContracts, payments: payments.filter(row => row.project_id === project.projectId), parties })
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
    readMany: (scope, projectIds, directory) => readMany(metadata, tables, scope, projectIds, directory),
  }
  return new ConcreteProjectFinanceRepository(source)
}
