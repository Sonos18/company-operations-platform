/* eslint-disable @typescript-eslint/no-explicit-any */
import Decimal from 'decimal.js'
import { projectCostBreakdownSchema, projectCostItemSchema, projectCostSummarySchema } from '../../../shared/schemas/costs/project-costs'

const zero = () => ({ acceptedValue: '0.0000', acceptedCount: 0, inProgressValue: '0.0000', inProgressCount: 0, unknownStatusValue: '0.0000', unknownCount: 0, totalTrackedWorkValue: '0.0000' })

export function summarizeProjectCosts(rows: any[]) {
  const currencies = new Set(rows.map(row => row.currency_code))
  if (currencies.size > 1) throw Object.assign(new Error('Mixed currencies'), { statusCode: 500, code: 'INTERNAL_ERROR' })
  const summary = zero(); let accepted = new Decimal(0); let progress = new Decimal(0); let unknown = new Decimal(0)
  for (const row of rows) { const value = new Decimal(row.amount_text); if (row.work_status === 'accepted') { accepted = accepted.plus(value); summary.acceptedCount++ } else if (row.work_status === 'in_progress') { progress = progress.plus(value); summary.inProgressCount++ } else { unknown = unknown.plus(value); summary.unknownCount++ } }
  summary.acceptedValue = accepted.toFixed(4); summary.inProgressValue = progress.toFixed(4); summary.unknownStatusValue = unknown.toFixed(4); summary.totalTrackedWorkValue = accepted.plus(progress).toFixed(4)
  return projectCostSummarySchema.parse(summary)
}

export class ProjectCostRepository {
  constructor(private readonly client: any) {}
  async listSummaries(tenantId: string, companyId: string) { const { data, error } = await this.client.from('project_cost_items').select('id,tenant_id,company_id,project_id,description,amount_text,currency_code,work_status,business_reference,party_id,engagement_id,component_id,relevant_date,version,created_by,created_at,updated_at').eq('tenant_id', tenantId).eq('company_id', companyId); if (error) throw error; return Object.entries((data ?? []).reduce((groups: any, row: any) => ((groups[row.project_id] ??= []).push(row), groups), {})).map(([projectId, rows]: any) => ({ projectId, summary: summarizeProjectCosts(rows) })).sort((a, b) => a.projectId.localeCompare(b.projectId)) }
  async projectSummary(tenantId: string, companyId: string, projectId: string) { const { data, error } = await this.client.from('project_cost_items').select('*').eq('tenant_id', tenantId).eq('company_id', companyId).eq('project_id', projectId).order('created_at').order('id'); if (error) throw error; const items = (data ?? []).map((row: any) => projectCostItemSchema.parse({ ...row, amount: row.amount_text, tenantId: row.tenant_id, companyId: row.company_id, projectId: row.project_id, currencyCode: row.currency_code, workStatus: row.work_status, businessReference: row.business_reference, partyId: row.party_id, engagementId: row.engagement_id, componentId: row.component_id, relevantDate: row.relevant_date, createdAt: row.created_at, updatedAt: row.updated_at })); return projectCostBreakdownSchema.parse({ projectId, summary: summarizeProjectCosts(data ?? []), items }) }
  create(context: any, input: any, idempotencyKey: string) { return this.client.rpc('c1_create_project_cost_item', { target_company_id: context.companyId, target_input: input, target_idempotency_key: idempotencyKey, target_request_id: context.requestId }) }
  update(context: any, id: string, mutation: any) { return this.client.rpc(mutation.kind === 'update' ? 'c1_update_project_cost_item' : 'c1_correct_project_cost_item', { target_company_id: context.companyId, target_id: id, target_input: mutation.input, target_request_id: context.requestId }) }
}
