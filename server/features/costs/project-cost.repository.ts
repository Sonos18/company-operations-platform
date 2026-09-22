import Decimal from 'decimal.js'
import { z } from 'zod'
import { costCommandAckSchema, prepareProjectCostFinancialsResultSchema, projectCostBreakdownSchema, projectCostDetailsResponseSchema, projectCostDraftSchema, projectCostItemDetailSchema, projectCostItemSchema, projectCostProjectMetadataSchema, projectCostSummaryEntrySchema, projectCostSummarySchema, type CostCommandAck, type CreateProjectCostDraftInput, type CreateProjectCostItemInput, type CorrectProjectCostItemInput, type PrepareProjectCostFinancialsInput, type PrepareProjectCostFinancialsResult, type ProjectCostBreakdown, type ProjectCostDetailsResponse, type ProjectCostDraft, type ProjectCostItem, type ProjectCostItemDetail, type ProjectCostSummary, type ProjectCostSummaryEntry, type UpdateProjectCostDraftInput, type UpdateProjectCostItemInput } from '../../../shared/schemas/costs/project-costs'
import { AppApiError } from '../../utils/api-error'
import type { UserSupabaseClient } from '../../utils/supabase-client'

const columns = 'id,tenant_id,company_id,project_id,description,amount_text,currency_code,work_status,business_reference,party_id,engagement_id,component_id,relevant_date,publication_state,version,created_by,created_at,updated_at'
const rowSchema = z.object({
  id: z.string().uuid(), tenant_id: z.string().uuid(), company_id: z.string().uuid(), project_id: z.string().uuid(), description: z.string(), amount_text: z.string(), currency_code: z.string().length(3), work_status: z.enum(['unknown', 'in_progress', 'accepted']), business_reference: z.string().nullable(), party_id: z.string().uuid().nullable(), engagement_id: z.string().uuid().nullable(), component_id: z.string().uuid().nullable(), relevant_date: z.string().date().nullable(), publication_state: z.enum(['draft', 'published']).optional(), version: z.number().int().nonnegative(), created_by: z.string().uuid(), created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
}).strict()
const parentRowSchema = z.object({
  id: z.string().uuid(), tenant_id: z.string().uuid(), company_id: z.string().uuid(), amount_text: z.string(), currency_code: z.string().length(3),
}).passthrough()
const detailColumns = 'id,tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,quantity_text,unit_code,unit_price_text,amount_text,retention_kind,retention_rate_bps,retention_amount_text,relevant_date,reference,note,version,created_by,created_at,updated_at'
const detailRowSchema = z.object({
  id: z.string().uuid(), tenant_id: z.string().uuid(), company_id: z.string().uuid(), project_cost_item_id: z.string().uuid(), line_no: z.number().int().positive(), detail_kind: z.enum(['opening_balance', 'line_item']), description: z.string().trim().min(1), quantity_text: z.string().nullable(), unit_code: z.string().nullable(), unit_price_text: z.string().nullable(), amount_text: z.string(), retention_kind: z.enum(['warranty', 'other']).nullable(), retention_rate_bps: z.number().int().min(0).max(10000).nullable(), retention_amount_text: z.string().nullable(), relevant_date: z.string().date().nullable(), reference: z.string().nullable(), note: z.string().nullable(), version: z.number().int().nonnegative(), created_by: z.string().uuid(), created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
}).strict()
const acknowledgementSchema = z.object({ id: z.string().uuid(), version: z.number().int().nonnegative() }).strict()
const createAcknowledgementSchema = acknowledgementSchema.extend({ replayed: z.boolean() }).strict()

type ProjectCostRow = z.infer<typeof rowSchema>
type ProjectCostDetailRow = z.infer<typeof detailRowSchema>
type Acknowledgement = z.infer<typeof acknowledgementSchema>
type CreateAcknowledgement = z.infer<typeof createAcknowledgementSchema>
type QueryResult = { data: unknown; error: unknown }
interface Query extends PromiseLike<QueryResult> { select(columns: string): Query; eq(column: string, value: string): Query; order(column: string): Query }
interface Client { from(table: 'project_cost_items' | 'project_cost_item_details'): Query; rpc(name: 'c1_create_project_cost_item' | 'c1_update_project_cost_item' | 'c1_correct_project_cost_item' | 'c1_read_project_cost_project_metadata' | 'c1_create_project_cost_draft' | 'c1_update_project_cost_draft' | 'c1_prepare_project_cost_financials' | 'c1_read_project_cost_draft' | 'c1_list_project_cost_drafts' | 'c1_publish_project_cost', args: Record<string, unknown>): Promise<QueryResult> }
export interface ProjectCostRequestContext { companyId: string; requestId: string }
export interface ProjectCostDataRepository { listSummaries(tenantId: string, companyId: string): Promise<ProjectCostSummaryEntry[]>; projectSummary(tenantId: string, companyId: string, projectId: string): Promise<ProjectCostBreakdown>; itemDetails(tenantId: string, companyId: string, projectCostItemId: string): Promise<ProjectCostDetailsResponse>; createDraft(context: ProjectCostRequestContext, input: CreateProjectCostDraftInput, idempotencyKey: string): Promise<CostCommandAck>; updateDraft(context: ProjectCostRequestContext, id: string, input: UpdateProjectCostDraftInput): Promise<CostCommandAck>; prepareFinancials(context: ProjectCostRequestContext, id: string, input: PrepareProjectCostFinancialsInput): Promise<PrepareProjectCostFinancialsResult>; draft(context: ProjectCostRequestContext, id: string): Promise<ProjectCostDraft>; listDrafts(context: ProjectCostRequestContext, projectId: string): Promise<ProjectCostDraft[]>; publish(context: ProjectCostRequestContext, id: string, expectedVersion: number, idempotencyKey: string): Promise<CostCommandAck>; create(context: ProjectCostRequestContext, input: CreateProjectCostItemInput, idempotencyKey: string): Promise<CreateAcknowledgement>; update(context: ProjectCostRequestContext, id: string, mutation: { kind: 'update'; input: UpdateProjectCostItemInput } | { kind: 'correction'; input: CorrectProjectCostItemInput }): Promise<Acknowledgement> }

function fail(message: string): never { throw new AppApiError(500, 'INTERNAL_ERROR', message) }
function rows(value: unknown): ProjectCostRow[] { const parsed = z.array(rowSchema).safeParse(value); return parsed.success ? parsed.data : fail('Không thể đọc Project Cost.') }
function detailRows(value: unknown): ProjectCostDetailRow[] { const parsed = z.array(detailRowSchema).safeParse(value); return parsed.success ? parsed.data : fail('Không thể đọc chi tiết Project Cost.') }
function item(row: ProjectCostRow): ProjectCostItem { return projectCostItemSchema.parse({ id: row.id, tenantId: row.tenant_id, companyId: row.company_id, projectId: row.project_id, description: row.description, amount: row.amount_text, currencyCode: row.currency_code, workStatus: row.work_status, businessReference: row.business_reference, partyId: row.party_id, engagementId: row.engagement_id, componentId: row.component_id, relevantDate: row.relevant_date, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at }) }
function detailItem(row: ProjectCostDetailRow): ProjectCostItemDetail { return projectCostItemDetailSchema.parse({ id: row.id, projectCostItemId: row.project_cost_item_id, lineNo: row.line_no, detailKind: row.detail_kind, description: row.description, quantity: row.quantity_text, unitCode: row.unit_code, unitPrice: row.unit_price_text, amount: row.amount_text, retentionKind: row.retention_kind, retentionRateBps: row.retention_rate_bps, retentionAmount: row.retention_amount_text, relevantDate: row.relevant_date, reference: row.reference, note: row.note, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at }) }


export function summarizeProjectCosts(rows: readonly ProjectCostRow[]): ProjectCostSummary {
  if (rows.length === 0) return fail('Không thể đọc Project Cost.')
  if (new Set(rows.map(row => row.currency_code)).size > 1) return fail('Project Cost có nhiều loại tiền tệ.')
  let accepted = new Decimal(0); let inProgress = new Decimal(0); let unknown = new Decimal(0); let acceptedCount = 0; let inProgressCount = 0; let unknownCount = 0
  for (const row of rows) {
    const amount = new Decimal(row.amount_text)
    if (row.work_status === 'accepted') { accepted = accepted.plus(amount); acceptedCount += 1 } else if (row.work_status === 'in_progress') { inProgress = inProgress.plus(amount); inProgressCount += 1 } else { unknown = unknown.plus(amount); unknownCount += 1 }
  }
  return projectCostSummarySchema.parse({ currencyCode: rows[0]!.currency_code, acceptedValue: accepted.toFixed(4), acceptedCount, inProgressValue: inProgress.toFixed(4), inProgressCount, unknownStatusValue: unknown.toFixed(4), unknownCount, totalTrackedWorkValue: accepted.plus(inProgress).toFixed(4) })
}

function rpcError(error: unknown): never {
  const parsed = z.object({ code: z.string().optional(), message: z.string().optional(), details: z.string().optional() }).safeParse(error)
  const code = parsed.success ? [parsed.data.message, parsed.data.code].find(value => ['MODULE_DISABLED', 'PERMISSION_DENIED', 'RESOURCE_NOT_FOUND', 'IDEMPOTENCY_CONFLICT', 'VERSION_CONFLICT', 'INPUT_INVALID', 'COST_NOT_DRAFT', 'COST_ALREADY_PUBLISHED', 'COST_PUBLISH_NOT_READY', 'SOURCE_VERSION_NOT_SHARED', 'SOURCE_REVIEW_REQUIRED', 'SUBCONTRACT_COST_MODEL_UNSUPPORTED'].includes(value ?? '')) : undefined
  if (code === 'MODULE_DISABLED') throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.', { reason: 'MODULE_DISABLED' })
  if (code === 'PERMISSION_DENIED') throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  if (code === 'RESOURCE_NOT_FOUND') throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy Project Cost.')
  if (code === 'IDEMPOTENCY_CONFLICT') throw new AppApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key không khớp.')
  if (code === 'VERSION_CONFLICT') throw new AppApiError(409, 'VERSION_CONFLICT', 'Dữ liệu đã thay đổi.')
  if (code === 'COST_NOT_DRAFT') throw new AppApiError(409, 'COST_NOT_DRAFT', 'Project Cost không còn ở trạng thái nháp.')
  if (code === 'COST_ALREADY_PUBLISHED') throw new AppApiError(409, 'COST_ALREADY_PUBLISHED', 'Project Cost đã được công bố.')
  if (code === 'COST_PUBLISH_NOT_READY') {
    let blockingCodes: unknown = []
    try { blockingCodes = JSON.parse(parsed.success ? parsed.data.details ?? '[]' : '[]') } catch { blockingCodes = [] }
    throw new AppApiError(409, 'COST_PUBLISH_NOT_READY', 'Project Cost chưa sẵn sàng công bố.', { blockingCodes })
  }
  if (code === 'SUBCONTRACT_COST_MODEL_UNSUPPORTED') throw new AppApiError(409, 'SUBCONTRACT_COST_MODEL_UNSUPPORTED', 'Chi phí thầu phụ sử dụng sổ thanh toán chuẩn.')
  if (code === 'SOURCE_VERSION_NOT_SHARED' || code === 'SOURCE_REVIEW_REQUIRED') throw new AppApiError(409, 'COST_PUBLISH_NOT_READY', 'Nguồn kế toán chưa sẵn sàng.', { reason: code })
  if (code === 'INPUT_INVALID') throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu không hợp lệ.')
  return fail('Không thể cập nhật Project Cost.')
}

function metadata(value: unknown, projectIds: readonly string[]) {
  const parsed = z.array(projectCostProjectMetadataSchema).safeParse(value)
  if (!parsed.success || parsed.data.length !== projectIds.length) return fail('Không thể đọc Project Cost.')
  const expected = new Set(projectIds)
  const found = new Map<string, z.infer<typeof projectCostProjectMetadataSchema>>()
  for (const entry of parsed.data) {
    if (!expected.has(entry.projectId) || found.has(entry.projectId)) return fail('Không thể đọc Project Cost.')
    found.set(entry.projectId, entry)
  }
  return found.size === expected.size ? found : fail('Không thể đọc Project Cost.')
}

export class ProjectCostRepository implements ProjectCostDataRepository {
  private readonly client: Client

  constructor(client: UserSupabaseClient) { this.client = client as unknown as Client }

  private async projectMetadata(companyId: string, projectIds: readonly string[]) {
    const { data, error } = await this.client.rpc('c1_read_project_cost_project_metadata', { target_company_id: companyId, target_project_ids: projectIds })
    if (error) return rpcError(error)
    return metadata(data, projectIds)
  }

  async listSummaries(tenantId: string, companyId: string) {
    const { data, error } = await this.client.from('project_cost_items').select(columns).eq('tenant_id', tenantId).eq('company_id', companyId).eq('publication_state', 'published')
    if (error) return rpcError(error)
    const result = rows(data)
    const grouped = new Map<string, ProjectCostRow[]>()
    for (const row of result) grouped.set(row.project_id, [...(grouped.get(row.project_id) ?? []), row])
    if (grouped.size === 0) return []
    const summaries = [...grouped].map(([projectId, projectRows]) => ({ projectId, summary: summarizeProjectCosts(projectRows) })).sort((a, b) => a.projectId.localeCompare(b.projectId))
    const projectMetadata = await this.projectMetadata(companyId, summaries.map(entry => entry.projectId))
    return summaries.map(entry => projectCostSummaryEntrySchema.parse({ ...projectMetadata.get(entry.projectId)!, ...entry }))
  }

  async projectSummary(tenantId: string, companyId: string, projectId: string) {
    const { data, error } = await this.client.from('project_cost_items').select(columns).eq('tenant_id', tenantId).eq('company_id', companyId).eq('project_id', projectId).eq('publication_state', 'published').order('created_at').order('id')
    if (error) return rpcError(error)
    const result = rows(data)
    if (result.length === 0) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy Project Cost.')
    const projectMetadata = await this.projectMetadata(companyId, [projectId])
    return projectCostBreakdownSchema.parse({ ...projectMetadata.get(projectId)!, projectId, summary: summarizeProjectCosts(result), items: result.map(item) })
  }

  private async command(rpc: 'c1_create_project_cost_draft' | 'c1_update_project_cost_draft', context: ProjectCostRequestContext, args: Record<string, unknown>) {
    const { data, error } = await this.client.rpc(rpc, { target_company_id: context.companyId, ...args, target_request_id: context.requestId })
    if (error) return rpcError(error)
    const result = costCommandAckSchema.safeParse(data)
    return result.success ? result.data : fail('Không thể cập nhật bản nháp Project Cost.')
  }

  createDraft(context: ProjectCostRequestContext, input: CreateProjectCostDraftInput, idempotencyKey: string) {
    return this.command('c1_create_project_cost_draft', context, { target_input: input, target_idempotency_key: idempotencyKey })
  }

  updateDraft(context: ProjectCostRequestContext, id: string, input: UpdateProjectCostDraftInput) {
    return this.command('c1_update_project_cost_draft', context, { target_id: id, target_input: input })
  }

  async prepareFinancials(context: ProjectCostRequestContext, id: string, input: PrepareProjectCostFinancialsInput) {
    const { data, error } = await this.client.rpc('c1_prepare_project_cost_financials', { target_company_id: context.companyId, target_id: id, target_input: input, target_request_id: context.requestId })
    if (error) return rpcError(error)
    const result = prepareProjectCostFinancialsResultSchema.safeParse(data)
    return result.success ? result.data : fail('Không thể chuẩn bị tài chính Project Cost.')
  }

  async draft(context: ProjectCostRequestContext, id: string) {
    const { data, error } = await this.client.rpc('c1_read_project_cost_draft', { target_company_id: context.companyId, target_id: id })
    if (error) return rpcError(error)
    const result = projectCostDraftSchema.safeParse(data)
    return result.success ? result.data : fail('Không thể đọc bản nháp Project Cost.')
  }

  async listDrafts(context: ProjectCostRequestContext, projectId: string) {
    const { data, error } = await this.client.rpc('c1_list_project_cost_drafts', { target_company_id: context.companyId, target_project_id: projectId })
    if (error) return rpcError(error)
    const result = z.array(projectCostDraftSchema).safeParse(data)
    return result.success ? result.data : fail('Không thể đọc danh sách bản nháp Project Cost.')
  }

  async publish(context: ProjectCostRequestContext, id: string, expectedVersion: number, idempotencyKey: string) {
    const { data, error } = await this.client.rpc('c1_publish_project_cost', { target_company_id: context.companyId, target_id: id, target_expected_version: expectedVersion, target_idempotency_key: idempotencyKey, target_request_id: context.requestId })
    if (error) return rpcError(error)
    const result = costCommandAckSchema.safeParse(data)
    return result.success ? result.data : fail('Không thể công bố Project Cost.')
  }

  async create(context: ProjectCostRequestContext, input: CreateProjectCostItemInput, idempotencyKey: string) {
    const { data, error } = await this.client.rpc('c1_create_project_cost_item', { target_company_id: context.companyId, target_input: input, target_idempotency_key: idempotencyKey, target_request_id: context.requestId })
    if (error) return rpcError(error)
    const acknowledgement = createAcknowledgementSchema.safeParse(data)
    return acknowledgement.success ? acknowledgement.data : fail('Không thể tạo Project Cost.')
  }

  async update(context: ProjectCostRequestContext, id: string, mutation: { kind: 'update'; input: UpdateProjectCostItemInput } | { kind: 'correction'; input: CorrectProjectCostItemInput }) {
    const rpc = mutation.kind === 'update' ? 'c1_update_project_cost_item' : 'c1_correct_project_cost_item'
    const { data, error } = await this.client.rpc(rpc, { target_company_id: context.companyId, target_id: id, target_input: mutation.input, target_request_id: context.requestId })
    if (error) return rpcError(error)
    const acknowledgement = acknowledgementSchema.safeParse(data)
    return acknowledgement.success ? acknowledgement.data : fail('Không thể cập nhật Project Cost.')
  }

  async itemDetails(tenantId: string, companyId: string, projectCostItemId: string): Promise<ProjectCostDetailsResponse> {
    const parentRes = await this.client.from('project_cost_items').select('id,tenant_id,company_id,amount_text,currency_code').eq('tenant_id', tenantId).eq('company_id', companyId).eq('id', projectCostItemId).eq('publication_state', 'published')
    if (parentRes.error) return rpcError(parentRes.error)
    const parsedParents = z.array(parentRowSchema).safeParse(parentRes.data)
    if (!parsedParents.success || parsedParents.data.length === 0) {
      throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy Project Cost.')
    }
    const parent = parsedParents.data[0]!

    const detailsRes = await this.client.from('project_cost_item_details').select(detailColumns).eq('tenant_id', tenantId).eq('company_id', companyId).eq('project_cost_item_id', projectCostItemId).order('line_no').order('id')
    if (detailsRes.error) return rpcError(detailsRes.error)
    const dRows = detailRows(detailsRes.data)

    if (dRows.length > 0) {
      let sum = new Decimal(0)
      for (const row of dRows) {
        sum = sum.plus(new Decimal(row.amount_text))
      }
      if (!sum.eq(new Decimal(parent.amount_text))) {
        return fail('Tổng chi tiết không khớp với số tiền của Project Cost.')
      }
    }

    return projectCostDetailsResponseSchema.parse({
      projectCostItemId: parent.id,
      totalAmount: parent.amount_text,
      currencyCode: parent.currency_code,
      details: dRows.map(detailItem),
    })
  }
}
