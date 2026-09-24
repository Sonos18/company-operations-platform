import { z } from 'zod'
import { financeRowMoneySchema, financeTimestampSchema, financeVersionSchema } from '../../../../shared/schemas/costs/project-finance'
import { AppApiError } from '../../../utils/api-error'
import { scanUuidRows } from './read-pages'

const uuid = z.string().uuid()
const date = z.string().date()
const currency = z.string().length(3)
const money = financeRowMoneySchema
const timestamp = financeTimestampSchema
const version = financeVersionSchema

export type FinanceProjectContextRow = { projectId: string, projectCode: string, projectName: string, defaultCurrencyCode: string, moneyScale: number, timeZone: string, operationalState: 'active' | 'completed' | 'paused' | 'unknown' }
export type FinanceDirectory = { defaultCurrencyCode: string, moneyScale: number, timeZone: string, projects: { projectId: string, projectCode: string, projectName: string }[], nextCursor: string | null }
export type FinancePartyRow = { partyId: string, code: string, displayName: string, partyKind: 'organization' | 'crew' }

export const costCategoryRowSchema = z.object({ id: uuid, tenant_id: uuid, company_id: uuid, code: z.string().min(1), name: z.string().min(1), display_order: z.number().int(), is_active: z.boolean(), version }).strict()
export const costItemRowSchema = z.object({
  id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, cost_category_id: uuid.nullable(), description: z.string(), business_reference: z.string().nullable(), amount_text: money, currency_code: currency, relevant_date: date.nullable(), publication_state: z.enum(['draft', 'published']).optional(), version, created_at: timestamp, updated_at: timestamp,
}).strict()
export const detailRowSchema = z.object({
  id: uuid, tenant_id: uuid, company_id: uuid, project_cost_item_id: uuid, line_no: z.number().int().positive(), detail_kind: z.enum(['opening_balance', 'line_item']), description: z.string(), quantity_text: z.string().nullable(), unit_code: z.string().nullable(), unit_price_text: z.string().nullable(), amount_text: money,
  retention_kind: z.enum(['warranty', 'other']).nullable(), retention_rate_bps: z.number().int().min(0).max(10000).nullable(), retention_amount_text: money.nullable(), relevant_date: date.nullable(), reference: z.string().nullable(), note: z.string().nullable(), publication_state: z.enum(['draft', 'published']).optional(), version, created_at: timestamp, updated_at: timestamp,
}).strict()
export const detailAggregateRowSchema = z.object({
  id: uuid, tenant_id: uuid, company_id: uuid, project_cost_item_id: uuid, line_no: z.number().int().positive(), amount_text: money,
  retention_kind: z.enum(['warranty', 'other']).nullable(), retention_rate_bps: z.number().int().min(0).max(10000).nullable(), retention_amount_text: money.nullable(), relevant_date: date.nullable(), publication_state: z.enum(['draft', 'published']).optional(), version, created_at: timestamp, updated_at: timestamp,
}).strict()
export const budgetRowSchema = z.object({
  id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, revision_no: z.number().int().nonnegative(), name: z.string().min(1), currency_code: currency, detail_mode: z.enum(['summary', 'categorized']), total_amount_text: money, status: z.string().min(1), approved_at: timestamp.nullable(), effective_date: date.nullable(), reference: z.string().nullable(), source_reference: z.string().nullable(), note: z.string().nullable(), version, updated_at: timestamp,
}).strict()
export const budgetLineRowSchema = z.object({
  id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, budget_version_id: uuid, cost_category_id: uuid, line_no: z.number().int().positive(), amount_text: money, description: z.string(), reference: z.string().nullable(), source_reference: z.string().nullable(), note: z.string().nullable(), version, updated_at: timestamp,
}).strict()
export const ownerAdvanceRowSchema = z.object({
  id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, amount_text: money, currency_code: currency, status: z.string().min(1), description: z.string(), payer_name: z.string().nullable(), receipt_no: z.string().nullable(), received_date: date.nullable(), reference: z.string().nullable(), source_reference: z.string().nullable(), note: z.string().nullable(), version, created_at: timestamp, updated_at: timestamp,
}).strict()
export const subcontractRowSchema = z.object({
  id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, subcontractor_party_id: uuid, code: z.string().min(1), contract_no: z.string().nullable(), contract_name: z.string().min(1), contract_date: date.nullable(), contract_value_text: money.nullable(), currency_code: currency, warranty_retention_rate_bps: z.number().int().min(0).max(10000).nullable(), is_active: z.boolean(), reference: z.string().nullable(), source_reference: z.string().nullable(), note: z.string().nullable(), version, updated_at: timestamp,
}).strict()
export const paymentRowSchema = z.object({
  id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, project_subcontract_id: uuid, paid_amount_text: money, warranty_retention_amount_text: money.nullable(), retention_rate_bps: z.number().int().min(0).max(10000).nullable(), currency_code: currency, status: z.string().min(1), description: z.string(), payment_date: date.nullable(), payment_reference: z.string().nullable(), source_reference: z.string().nullable(), note: z.string().nullable(), replaces_payment_id: uuid.nullable(), created_at: timestamp, version, updated_at: timestamp,
}).strict()
const budgetAggregateRowSchema = z.object({ id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, currency_code: currency, detail_mode: z.enum(['summary', 'categorized']), total_amount_text: money, status: z.string().min(1), version, updated_at: timestamp }).strict()
const budgetLineAggregateRowSchema = z.object({ id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, budget_version_id: uuid, cost_category_id: uuid, line_no: z.number().int().positive(), amount_text: money, version, updated_at: timestamp }).strict()
const ownerAdvanceAggregateRowSchema = z.object({ id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, amount_text: money, currency_code: currency, status: z.string().min(1), source_reference: z.string().nullable(), version, updated_at: timestamp }).strict()
const subcontractAggregateRowSchema = z.object({ id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, subcontractor_party_id: uuid, code: z.string().min(1), contract_no: z.string().nullable(), contract_name: z.string().min(1), contract_date: date.nullable(), contract_value_text: money.nullable(), currency_code: currency, warranty_retention_rate_bps: z.number().int().min(0).max(10000).nullable(), is_active: z.boolean(), version, updated_at: timestamp }).strict()
const paymentAggregateRowSchema = z.object({ id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, project_subcontract_id: uuid, paid_amount_text: money, warranty_retention_amount_text: money.nullable(), retention_rate_bps: z.number().int().min(0).max(10000).nullable(), currency_code: currency, status: z.string().min(1), payment_date: date.nullable(), replaces_payment_id: uuid.nullable(), created_at: timestamp, version, updated_at: timestamp }).strict()
export const reconciliationResolutionRowSchema = z.object({
  id: uuid, tenant_id: uuid, company_id: uuid, project_id: uuid, cost_category_id: uuid,
  resolution_code: z.literal('canonical_subcontract_payments_authoritative'), reason: z.string().min(1), version, updated_at: timestamp,
}).strict()

export type FinanceBudgetAggregateRow = z.infer<typeof budgetAggregateRowSchema>
export type FinanceBudgetLineAggregateRow = z.infer<typeof budgetLineAggregateRowSchema>
export type FinanceOwnerAdvanceAggregateRow = z.infer<typeof ownerAdvanceAggregateRowSchema>
export type FinanceSubcontractAggregateRow = z.infer<typeof subcontractAggregateRowSchema>
export type FinancePaymentAggregateRow = z.infer<typeof paymentAggregateRowSchema>
export type FinanceReconciliationResolutionRow = z.infer<typeof reconciliationResolutionRowSchema>

type QueryResult = { data: unknown, error: unknown }
export type TableQuery = {
  select(columns: string): TableQuery
  eq(column: string, value: string): TableQuery
  in(column: string, values: readonly string[]): TableQuery
  gt(column: string, value: string): TableQuery
  order(column: string, options: { ascending: boolean }): TableQuery
  limit(size: number): Promise<QueryResult>
}
type RpcName = 'c1_read_project_finance_directory' | 'c1_read_project_finance_parties' | 'c1_read_project_cost_read_context' | 'c1_read_project_finance_operational_states'
type Rpc = (name: RpcName, args: Record<string, unknown>) => Promise<QueryResult>
export type FinanceDbClient = { from(table: string): TableQuery, rpc: Rpc }

const directorySchema = z.object({
  defaultCurrencyCode: currency, moneyScale: z.number().int().min(0).max(4), timeZone: z.string().min(1),
  projects: z.array(z.object({ projectId: uuid, projectCode: z.string().min(1), projectName: z.string().min(1) }).strict()), nextCursor: uuid.nullable(),
}).strict()
const contextSchema = z.object({ projectId: uuid, projectCode: z.string().min(1), projectName: z.string().min(1), defaultCurrencyCode: currency, moneyScale: z.number().int().min(0).max(4), timeZone: z.string().min(1) }).strict()
const partySchema = z.object({ partyId: uuid, code: z.string().min(1), displayName: z.string().min(1), partyKind: z.enum(['organization', 'crew']) }).strict()
const operationalStateRowSchema = z.object({ projectId: uuid, operationalState: z.enum(['active', 'completed', 'paused', 'unknown']) }).strict()

export function mapFinanceReadError(error: unknown): never {
  const parsed = z.object({ code: z.string().optional(), message: z.string().optional() }).safeParse(error)
  const values = parsed.success ? [parsed.data.code, parsed.data.message].filter((value): value is string => value !== undefined) : []
  if (values.includes('MODULE_DISABLED')) throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền xem dữ liệu tài chính.', { reason: 'MODULE_DISABLED' })
  if (values.includes('COMPANY_FORBIDDEN')) throw new AppApiError(403, 'COMPANY_FORBIDDEN', 'Bạn không có quyền truy cập công ty này.')
  if (values.includes('PERMISSION_DENIED')) throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền xem dữ liệu tài chính.')
  if (values.includes('RESOURCE_NOT_FOUND')) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy dự án.')
  if (values.includes('INPUT_INVALID')) throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
  throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc dữ liệu tài chính.')
}

function parseRows<T>(data: unknown, schema: z.ZodType<T>, message: string): T[] {
  const parsed = z.array(schema).safeParse(data)
  if (!parsed.success) throw new AppApiError(500, 'INTERNAL_ERROR', message)
  return parsed.data
}

function assertScope<T extends { tenant_id: string, company_id: string }>(rows: readonly T[], tenantId: string, companyId: string, message: string): T[] {
  if (rows.some(row => row.tenant_id !== tenantId || row.company_id !== companyId)) throw new AppApiError(500, 'INTERNAL_ERROR', message)
  return [...rows]
}
function assertProjectScope<T extends { project_id?: string }>(rows: readonly T[], projectIds: readonly string[], message: string): void {
  if (rows.some(row => row.project_id === undefined || !projectIds.includes(row.project_id))) throw new AppApiError(500, 'INTERNAL_ERROR', message)
}

export class ProjectFinanceMetadataReader {
  constructor(private readonly client: Pick<FinanceDbClient, 'rpc'>) {}

  async context(companyId: string, projectId: string): Promise<FinanceProjectContextRow> {
    const { data, error } = await this.client.rpc('c1_read_project_cost_read_context', { target_company_id: companyId, target_project_id: projectId })
    if (error) return mapFinanceReadError(error)
    const parsed = contextSchema.safeParse(data)
    if (!parsed.success) throw new AppApiError(500, 'INTERNAL_ERROR', 'Phản hồi metadata dự án không hợp lệ.')
    if (parsed.data.projectId !== projectId) throw new AppApiError(500, 'INTERNAL_ERROR', 'Phản hồi metadata dự án không hợp lệ.')
    const states = await this.operationalStates(companyId, [projectId])
    return { ...parsed.data, operationalState: states.get(projectId)! }
  }

  async operationalStates(companyId: string, projectIds: readonly string[]): Promise<Map<string, FinanceProjectContextRow['operationalState']>> {
    if (projectIds.length < 1 || projectIds.length > 100 || new Set(projectIds).size !== projectIds.length || projectIds.some(id => !uuid.safeParse(id).success)) throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
    const { data, error } = await this.client.rpc('c1_read_project_finance_operational_states', { target_company_id: companyId, target_project_ids: [...projectIds] })
    if (error) return mapFinanceReadError(error)
    const rows = parseRows(data, operationalStateRowSchema, 'Phản hồi trạng thái dự án không hợp lệ.')
    const states = new Map(rows.map(row => [row.projectId, row.operationalState]))
    if (rows.length !== projectIds.length || states.size !== projectIds.length || rows.some(row => !projectIds.includes(row.projectId))) throw new AppApiError(500, 'INTERNAL_ERROR', 'Phản hồi trạng thái dự án không hợp lệ.')
    return states
  }

  async directory(companyId: string, afterId: string | null, limit: number): Promise<FinanceDirectory> {
    const { data, error } = await this.client.rpc('c1_read_project_finance_directory', { target_company_id: companyId, target_after_id: afterId, target_limit: limit })
    if (error) return mapFinanceReadError(error)
    const parsed = directorySchema.safeParse(data)
    if (!parsed.success) throw new AppApiError(500, 'INTERNAL_ERROR', 'Phản hồi metadata không hợp lệ.')
    if (afterId !== null && parsed.data.projects.some(project => project.projectId <= afterId)) throw new AppApiError(500, 'INTERNAL_ERROR', 'Phản hồi metadata không hợp lệ.')
    for (let index = 1; index < parsed.data.projects.length; index += 1) if (parsed.data.projects[index - 1]!.projectId >= parsed.data.projects[index]!.projectId) throw new AppApiError(500, 'INTERNAL_ERROR', 'Phản hồi metadata không hợp lệ.')
    if (parsed.data.nextCursor !== null && parsed.data.projects.at(-1)?.projectId !== parsed.data.nextCursor) throw new AppApiError(500, 'INTERNAL_ERROR', 'Phản hồi metadata không hợp lệ.')
    return parsed.data
  }

  async parties(companyId: string, projectId: string, partyIds: readonly string[]): Promise<FinancePartyRow[]> {
    if (partyIds.length === 0) return []
    if (partyIds.length > 50 || new Set(partyIds).size !== partyIds.length || partyIds.some(id => !uuid.safeParse(id).success)) throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
    const { data, error } = await this.client.rpc('c1_read_project_finance_parties', { target_company_id: companyId, target_project_id: projectId, target_party_ids: [...partyIds] })
    if (error) return mapFinanceReadError(error)
    const parsed = parseRows(data, partySchema, 'Phản hồi nhà thầu không hợp lệ.')
    const returnedIds = parsed.map(row => row.partyId)
    if (parsed.length !== partyIds.length || new Set(returnedIds).size !== returnedIds.length || new Set(returnedIds).size !== new Set(partyIds).size || returnedIds.some(id => !partyIds.includes(id))) throw new AppApiError(500, 'INTERNAL_ERROR', 'Phản hồi nhà thầu không hợp lệ.')
    return parsed
  }
}

const columns = {
  categories: 'id,tenant_id,company_id,code,name,display_order,is_active,version',
  items: 'id,tenant_id,company_id,project_id,cost_category_id,description,business_reference,amount_text,currency_code,relevant_date,publication_state,version,created_at,updated_at',
  details: 'id,tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,quantity_text,unit_code,unit_price_text,amount_text,retention_kind,retention_rate_bps,retention_amount_text,relevant_date,reference,note,publication_state,version,created_at,updated_at',
  budgets: 'id,tenant_id,company_id,project_id,revision_no,name,currency_code,detail_mode,total_amount_text,status,approved_at,effective_date,reference,source_reference,note,version,updated_at',
  budgetLines: 'id,tenant_id,company_id,project_id,budget_version_id,cost_category_id,line_no,amount_text,description,reference,source_reference,note,version,updated_at',
  advances: 'id,tenant_id,company_id,project_id,amount_text,currency_code,status,description,payer_name,receipt_no,received_date,reference,source_reference,note,version,created_at,updated_at',
  subcontracts: 'id,tenant_id,company_id,project_id,subcontractor_party_id,code,contract_no,contract_name,contract_date,contract_value_text,currency_code,warranty_retention_rate_bps,is_active,reference,source_reference,note,version,updated_at',
  payments: 'id,tenant_id,company_id,project_id,project_subcontract_id,paid_amount_text,warranty_retention_amount_text,retention_rate_bps,currency_code,status,description,payment_date,payment_reference,source_reference,note,replaces_payment_id,created_at,version,updated_at',
  resolutions: 'id,tenant_id,company_id,project_id,cost_category_id,resolution_code,reason,version,updated_at',
} as const
const aggregateColumns = {
  budgets: 'id,tenant_id,company_id,project_id,currency_code,detail_mode,total_amount_text,status,version,updated_at',
  budgetLines: 'id,tenant_id,company_id,project_id,budget_version_id,cost_category_id,line_no,amount_text,version,updated_at',
  advances: 'id,tenant_id,company_id,project_id,amount_text,currency_code,status,source_reference,version,updated_at',
  subcontracts: 'id,tenant_id,company_id,project_id,subcontractor_party_id,code,contract_no,contract_name,contract_date,contract_value_text,currency_code,warranty_retention_rate_bps,is_active,version,updated_at',
  payments: 'id,tenant_id,company_id,project_id,project_subcontract_id,paid_amount_text,warranty_retention_amount_text,retention_rate_bps,currency_code,status,payment_date,replaces_payment_id,created_at,version,updated_at',
} as const
const detailAggregateColumns = 'id,tenant_id,company_id,project_cost_item_id,line_no,amount_text,retention_kind,retention_rate_bps,retention_amount_text,relevant_date,publication_state,version,created_at,updated_at'

type TableName = keyof typeof columns
type RowByTable = {
  categories: z.infer<typeof costCategoryRowSchema>
  items: z.infer<typeof costItemRowSchema>
  details: z.infer<typeof detailRowSchema>
  budgets: z.infer<typeof budgetRowSchema>
  budgetLines: z.infer<typeof budgetLineRowSchema>
  advances: z.infer<typeof ownerAdvanceRowSchema>
  subcontracts: z.infer<typeof subcontractRowSchema>
  payments: z.infer<typeof paymentRowSchema>
  resolutions: z.infer<typeof reconciliationResolutionRowSchema>
}
const tableNames: Record<TableName, string> = {
  categories: 'cost_categories', items: 'project_cost_items', details: 'project_cost_item_details', budgets: 'project_budget_versions', budgetLines: 'project_budget_lines', advances: 'project_owner_advances', subcontracts: 'project_subcontracts', payments: 'project_subcontract_payments', resolutions: 'project_cost_reconciliation_resolutions',
}
const schemas: { [K in TableName]: z.ZodType<RowByTable[K]> } = {
  categories: costCategoryRowSchema, items: costItemRowSchema, details: detailRowSchema, budgets: budgetRowSchema, budgetLines: budgetLineRowSchema, advances: ownerAdvanceRowSchema, subcontracts: subcontractRowSchema, payments: paymentRowSchema, resolutions: reconciliationResolutionRowSchema,
}

export class ProjectFinanceTableReader {
  constructor(private readonly client: Pick<FinanceDbClient, 'from'>) {}

  private async scanProjected<T extends { id: string, tenant_id: string, company_id: string }>(table: string, columnsText: string, schema: z.ZodType<T>, tenantId: string, companyId: string, projectIds?: readonly string[]): Promise<T[]> {
    if (projectIds && projectIds.length === 0) return []
    const chunks = projectIds ? Array.from({ length: Math.ceil(projectIds.length / 50) }, (_, index) => projectIds.slice(index * 50, index * 50 + 50)) : [undefined]
    const result: T[] = []
    for (const chunk of chunks) {
      const rows = await scanUuidRows(async (afterId, size) => {
        let query = this.client.from(table).select(columnsText).eq('tenant_id', tenantId).eq('company_id', companyId)
        if (table === tableNames.items) query = query.eq('publication_state', 'published')
        if (chunk) query = chunk.length === 1 ? query.eq('project_id', chunk[0]!) : query.in('project_id', chunk)
        if (afterId !== null) query = query.gt('id', afterId)
        const response = await query.order('id', { ascending: true }).limit(size)
        if (response.error) return mapFinanceReadError(response.error)
        const parsed = parseRows(response.data, schema, `Phản hồi ${table} không hợp lệ.`)
        const scoped = assertScope(parsed, tenantId, companyId, `Phản hồi ${table} không hợp lệ.`)
        if (chunk) assertProjectScope(scoped as readonly { project_id?: string }[], chunk, `Phản hồi ${table} không hợp lệ.`)
        return scoped
      })
      result.push(...rows)
    }
    return result
  }

  private scan<K extends TableName>(table: K, tenantId: string, companyId: string, projectIds?: readonly string[]): Promise<RowByTable[K][]> {
    return this.scanProjected(tableNames[table], columns[table], schemas[table], tenantId, companyId, projectIds)
  }

  categories(tenantId: string, companyId: string) { return this.scan('categories', tenantId, companyId) }
  costItems(tenantId: string, companyId: string, projectId: string) { return this.costItemsForProjects(tenantId, companyId, [projectId]) }
  costItemsForProjects(tenantId: string, companyId: string, projectIds: readonly string[]) { return this.scan('items', tenantId, companyId, projectIds) }
  budgets(tenantId: string, companyId: string, projectId: string, full = true) { return this.budgetsForProjects(tenantId, companyId, [projectId], full) }
  budgetsForProjects(tenantId: string, companyId: string, projectIds: readonly string[], full = true) { return full ? this.scan('budgets', tenantId, companyId, projectIds) : this.scanProjected('project_budget_versions', aggregateColumns.budgets, budgetAggregateRowSchema, tenantId, companyId, projectIds) }
  budgetLines(tenantId: string, companyId: string, projectId: string, full = true) { return this.budgetLinesForProjects(tenantId, companyId, [projectId], full) }
  budgetLinesForProjects(tenantId: string, companyId: string, projectIds: readonly string[], full = true) { return full ? this.scan('budgetLines', tenantId, companyId, projectIds) : this.scanProjected('project_budget_lines', aggregateColumns.budgetLines, budgetLineAggregateRowSchema, tenantId, companyId, projectIds) }
  ownerAdvances(tenantId: string, companyId: string, projectId: string, full = true) { return this.ownerAdvancesForProjects(tenantId, companyId, [projectId], full) }
  ownerAdvancesForProjects(tenantId: string, companyId: string, projectIds: readonly string[], full = true) { return full ? this.scan('advances', tenantId, companyId, projectIds) : this.scanProjected('project_owner_advances', aggregateColumns.advances, ownerAdvanceAggregateRowSchema, tenantId, companyId, projectIds) }
  subcontracts(tenantId: string, companyId: string, projectId: string, full = true) { return this.subcontractsForProjects(tenantId, companyId, [projectId], full) }
  subcontractsForProjects(tenantId: string, companyId: string, projectIds: readonly string[], full = true) { return full ? this.scan('subcontracts', tenantId, companyId, projectIds) : this.scanProjected('project_subcontracts', aggregateColumns.subcontracts, subcontractAggregateRowSchema, tenantId, companyId, projectIds) }
  payments(tenantId: string, companyId: string, projectId: string, full = true) { return this.paymentsForProjects(tenantId, companyId, [projectId], full) }
  paymentsForProjects(tenantId: string, companyId: string, projectIds: readonly string[], full = true) { return full ? this.scan('payments', tenantId, companyId, projectIds) : this.scanProjected('project_subcontract_payments', aggregateColumns.payments, paymentAggregateRowSchema, tenantId, companyId, projectIds) }
  resolutions(tenantId: string, companyId: string, projectId: string) { return this.resolutionsForProjects(tenantId, companyId, [projectId]) }
  resolutionsForProjects(tenantId: string, companyId: string, projectIds: readonly string[]) { return this.scan('resolutions', tenantId, companyId, projectIds) }

  private async detailScan<T extends { id: string, tenant_id: string, company_id: string, project_cost_item_id: string }>(tenantId: string, companyId: string, itemIds: readonly string[], columnsText: string, schema: z.ZodType<T>) {
    if (itemIds.length === 0) return [] as T[]
    const result: T[] = []
    for (let index = 0; index < itemIds.length; index += 50) {
      const ids = itemIds.slice(index, index + 50)
      const rows = await scanUuidRows(async (afterId, size) => {
        let query = this.client.from(tableNames.details).select(columnsText).eq('tenant_id', tenantId).eq('company_id', companyId).eq('publication_state', 'published').in('project_cost_item_id', ids)
        if (afterId !== null) query = query.gt('id', afterId)
        const response = await query.order('id', { ascending: true }).limit(size)
        if (response.error) return mapFinanceReadError(response.error)
        const parsed = parseRows(response.data, schema, 'Phản hồi chi tiết Project Cost không hợp lệ.')
        if (parsed.some(row => row.tenant_id !== tenantId || row.company_id !== companyId || !ids.includes(row.project_cost_item_id))) throw new AppApiError(500, 'INTERNAL_ERROR', 'Phản hồi chi tiết Project Cost không hợp lệ.')
        return parsed
      })
      result.push(...rows)
    }
    return result
  }
  details(tenantId: string, companyId: string, itemIds: readonly string[]) { return this.detailScan(tenantId, companyId, itemIds, columns.details, detailRowSchema) }
  detailAggregates(tenantId: string, companyId: string, itemIds: readonly string[]) { return this.detailScan(tenantId, companyId, itemIds, detailAggregateColumns, detailAggregateRowSchema) }
}

export type FinanceDetailAggregateRow = z.infer<typeof detailAggregateRowSchema>
export type FinanceDetailRow = z.infer<typeof detailRowSchema>
export type FinanceTableRows = {
  categories: RowByTable['categories'][]
  costItems: RowByTable['items'][]
  details: FinanceDetailAggregateRow[]
  budgets: RowByTable['budgets'][]
  budgetLines: RowByTable['budgetLines'][]
  ownerAdvances: RowByTable['advances'][]
  subcontracts: RowByTable['subcontracts'][]
  payments: RowByTable['payments'][]
  resolutions: RowByTable['resolutions'][]
}
export type FinanceSummaryTableRows = Omit<FinanceTableRows, 'budgets' | 'budgetLines' | 'ownerAdvances' | 'subcontracts' | 'payments'> & {
  budgets: FinanceBudgetAggregateRow[]
  budgetLines: FinanceBudgetLineAggregateRow[]
  ownerAdvances: FinanceOwnerAdvanceAggregateRow[]
  subcontracts: FinanceSubcontractAggregateRow[]
  payments: FinancePaymentAggregateRow[]
}
