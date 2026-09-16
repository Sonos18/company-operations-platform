import Decimal from 'decimal.js'
import { z } from 'zod'
import { projectCostBreakdownSchema, projectCostItemSchema, projectCostSummarySchema, type CreateProjectCostItemInput, type CorrectProjectCostItemInput, type ProjectCostBreakdown, type ProjectCostItem, type ProjectCostSummary, type UpdateProjectCostItemInput } from '../../../shared/schemas/costs/project-costs'
import { AppApiError } from '../../utils/api-error'
import type { UserSupabaseClient } from '../../utils/supabase-client'

const columns = 'id,tenant_id,company_id,project_id,description,amount_text,currency_code,work_status,business_reference,party_id,engagement_id,component_id,relevant_date,version,created_by,created_at,updated_at'
const rowSchema = z.object({
  id: z.string().uuid(), tenant_id: z.string().uuid(), company_id: z.string().uuid(), project_id: z.string().uuid(), description: z.string(), amount_text: z.string(), currency_code: z.string().length(3), work_status: z.enum(['unknown', 'in_progress', 'accepted']), business_reference: z.string().nullable(), party_id: z.string().uuid().nullable(), engagement_id: z.string().uuid().nullable(), component_id: z.string().uuid().nullable(), relevant_date: z.string().date().nullable(), version: z.number().int().nonnegative(), created_by: z.string().uuid(), created_at: z.string().datetime(), updated_at: z.string().datetime(),
}).strict()
const acknowledgementSchema = z.object({ id: z.string().uuid(), version: z.number().int().nonnegative() }).strict()
const createAcknowledgementSchema = acknowledgementSchema.extend({ replayed: z.boolean() }).strict()

type ProjectCostRow = z.infer<typeof rowSchema>
type Acknowledgement = z.infer<typeof acknowledgementSchema>
type CreateAcknowledgement = z.infer<typeof createAcknowledgementSchema>
type QueryResult = { data: unknown; error: unknown }
interface Query extends PromiseLike<QueryResult> { select(columns: string): Query; eq(column: string, value: string): Query; order(column: string): Query }
interface Client { from(table: 'project_cost_items'): Query; rpc(name: 'c1_create_project_cost_item' | 'c1_update_project_cost_item' | 'c1_correct_project_cost_item', args: Record<string, unknown>): Promise<QueryResult> }
export interface ProjectCostRequestContext { companyId: string; requestId: string }
export interface ProjectCostDataRepository { listSummaries(tenantId: string, companyId: string): Promise<Array<{ projectId: string; summary: ProjectCostSummary }>>; projectSummary(tenantId: string, companyId: string, projectId: string): Promise<ProjectCostBreakdown>; create(context: ProjectCostRequestContext, input: CreateProjectCostItemInput, idempotencyKey: string): Promise<CreateAcknowledgement>; update(context: ProjectCostRequestContext, id: string, mutation: { kind: 'update'; input: UpdateProjectCostItemInput } | { kind: 'correction'; input: CorrectProjectCostItemInput }): Promise<Acknowledgement> }

function fail(message: string): never { throw new AppApiError(500, 'INTERNAL_ERROR', message) }
function rows(value: unknown): ProjectCostRow[] { const parsed = z.array(rowSchema).safeParse(value); return parsed.success ? parsed.data : fail('Không thể đọc Project Cost.') }
function item(row: ProjectCostRow): ProjectCostItem { return projectCostItemSchema.parse({ id: row.id, tenantId: row.tenant_id, companyId: row.company_id, projectId: row.project_id, description: row.description, amount: row.amount_text, currencyCode: row.currency_code, workStatus: row.work_status, businessReference: row.business_reference, partyId: row.party_id, engagementId: row.engagement_id, componentId: row.component_id, relevantDate: row.relevant_date, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at }) }

export function summarizeProjectCosts(rows: readonly ProjectCostRow[]): ProjectCostSummary {
  if (new Set(rows.map(row => row.currency_code)).size > 1) return fail('Project Cost có nhiều loại tiền tệ.')
  let accepted = new Decimal(0); let inProgress = new Decimal(0); let unknown = new Decimal(0); let acceptedCount = 0; let inProgressCount = 0; let unknownCount = 0
  for (const row of rows) {
    const amount = new Decimal(row.amount_text)
    if (row.work_status === 'accepted') { accepted = accepted.plus(amount); acceptedCount += 1 } else if (row.work_status === 'in_progress') { inProgress = inProgress.plus(amount); inProgressCount += 1 } else { unknown = unknown.plus(amount); unknownCount += 1 }
  }
  return projectCostSummarySchema.parse({ acceptedValue: accepted.toFixed(4), acceptedCount, inProgressValue: inProgress.toFixed(4), inProgressCount, unknownStatusValue: unknown.toFixed(4), unknownCount, totalTrackedWorkValue: accepted.plus(inProgress).toFixed(4) })
}

function rpcError(error: unknown): never {
  const parsed = z.object({ code: z.string().optional(), message: z.string().optional() }).safeParse(error)
  const code = parsed.success ? [parsed.data.message, parsed.data.code].find(value => ['MODULE_DISABLED', 'PERMISSION_DENIED', 'RESOURCE_NOT_FOUND', 'IDEMPOTENCY_CONFLICT', 'VERSION_CONFLICT', 'INPUT_INVALID'].includes(value ?? '')) : undefined
  if (code === 'MODULE_DISABLED') throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.', { reason: 'MODULE_DISABLED' })
  if (code === 'PERMISSION_DENIED') throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  if (code === 'RESOURCE_NOT_FOUND') throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy Project Cost.')
  if (code === 'IDEMPOTENCY_CONFLICT') throw new AppApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key không khớp.')
  if (code === 'VERSION_CONFLICT') throw new AppApiError(409, 'VERSION_CONFLICT', 'Dữ liệu đã thay đổi.')
  if (code === 'INPUT_INVALID') throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu không hợp lệ.')
  return fail('Không thể cập nhật Project Cost.')
}

export class ProjectCostRepository implements ProjectCostDataRepository {
  private readonly client: Client

  constructor(client: UserSupabaseClient) { this.client = client as unknown as Client }

  async listSummaries(tenantId: string, companyId: string) {
    const { data, error } = await this.client.from('project_cost_items').select(columns).eq('tenant_id', tenantId).eq('company_id', companyId)
    if (error) return rpcError(error)
    const result = rows(data)
    const grouped = new Map<string, ProjectCostRow[]>()
    for (const row of result) grouped.set(row.project_id, [...(grouped.get(row.project_id) ?? []), row])
    return [...grouped].map(([projectId, projectRows]) => ({ projectId, summary: summarizeProjectCosts(projectRows) })).sort((a, b) => a.projectId.localeCompare(b.projectId))
  }

  async projectSummary(tenantId: string, companyId: string, projectId: string) {
    const { data, error } = await this.client.from('project_cost_items').select(columns).eq('tenant_id', tenantId).eq('company_id', companyId).eq('project_id', projectId).order('created_at').order('id')
    if (error) return rpcError(error)
    const result = rows(data)
    return projectCostBreakdownSchema.parse({ projectId, summary: summarizeProjectCosts(result), items: result.map(item) })
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
}
