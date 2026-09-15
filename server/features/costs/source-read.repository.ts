import { z } from 'zod'
import { isoTimestampSchema, type CostSourceFigure, type CostSourceFiguresQuery } from '../../../shared/schemas/costs/source-read-model'
import { AppApiError } from '../../utils/api-error'
import type { UserSupabaseClient } from '../../utils/supabase-client'

const probeRunId = '00000000-0000-4000-8000-000000000001'
const figureColumns = `id, tenant_id, company_id, label, raw_value_text, value_state, amount_text, currency_code, basis, scope_kind, scope_description, mapping_state, project_id, engagement_id, party_id, confirmation, created_at, source_selections!inner(id, locator, mapped_project_id, mapped_engagement_id, mapped_party_id, accounting_source_versions!inner(id, version_no, original_filename, accounting_sources!inner(id, code, title, source_system)), projects!source_selections_mapped_project_id_tenant_id_company_id_fkey(id, code, name), project_engagements!source_selections_mapped_engagement_id_tenant_id_company_i_fkey(id, code, name), business_parties!source_selections_mapped_party_id_tenant_id_company_id_fkey(id, code, display_name), source_review_issues(issue_kind, impact, description, status)), projects!source_reported_figures_project_id_tenant_id_company_id_fkey(id, code, name), project_engagements!source_reported_figures_engagement_id_tenant_id_company_id_fkey(id, code, name), business_parties!source_reported_figures_party_id_tenant_id_company_id_fkey(id, code, display_name)`

interface Query {
  select(columns: string): Query; eq(column: string, value: string): Query; gt(column: string, value: string): Query; ilike(column: string, value: string): Query; or(filters: string): Query; order(column: string): Query; limit(value: number): Promise<{ data: unknown; error: unknown }>; maybeSingle(): Promise<{ data: unknown; error: unknown }>
}
interface Client { from(table: 'source_reported_figures'): Query; rpc(name: 'c1_get_controlled_import_result', args: Record<string, string>): Promise<{ data: unknown; error: unknown }> }

const row = z.object({
  id: z.string().uuid(), tenant_id: z.string().uuid(), company_id: z.string().uuid(), label: z.string(), raw_value_text: z.string(), value_state: z.enum(['known', 'blank', 'formula_error', 'missing_cached', 'not_numeric']), amount_text: z.string().nullable(), currency_code: z.string().nullable(), basis: z.enum(['net', 'gross', 'payable_basis', 'cash', 'mixed', 'unknown']), scope_kind: z.enum(['subcontractors_only', 'whole_project', 'mixed', 'unknown']), scope_description: z.string().default(''), mapping_state: z.enum(['confirmed', 'pending', 'reference_only', 'excluded']), project_id: z.string().uuid().nullable().optional(), engagement_id: z.string().uuid().nullable().optional(), party_id: z.string().uuid().nullable().optional(), confirmation: z.enum(['unverified', 'confirmed_external', 'disputed']), created_at: isoTimestampSchema,
  source_selections: z.object({ id: z.string().uuid(), locator: z.unknown(), mapped_project_id: z.string().uuid().nullable().optional(), mapped_engagement_id: z.string().uuid().nullable().optional(), mapped_party_id: z.string().uuid().nullable().optional(), accounting_source_versions: z.object({ id: z.string().uuid(), version_no: z.number().int().positive(), original_filename: z.string(), accounting_sources: z.object({ id: z.string().uuid(), code: z.string(), title: z.string(), source_system: z.string() }) }), projects: z.unknown().optional(), project_engagements: z.unknown().optional(), business_parties: z.unknown().optional(), source_review_issues: z.array(z.object({ issue_kind: z.string(), impact: z.string(), description: z.string(), status: z.string() })).default([]) }),
  projects: z.unknown().optional(), project_engagements: z.unknown().optional(), business_parties: z.unknown().optional(),
})
const project = z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }).nullable()
const party = z.object({ id: z.string().uuid(), code: z.string(), display_name: z.string() }).nullable()

function databaseError(): never { throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc nguồn chi phí.') }
function one(value: unknown) { return Array.isArray(value) ? value[0] ?? null : value ?? null }
function map(value: unknown): CostSourceFigure {
  const parsed = row.safeParse(value)
  if (!parsed.success) return databaseError()
  const selection = parsed.data.source_selections
  const sourceVersion = selection.accounting_source_versions
  const source = sourceVersion.accounting_sources
  return {
    id: parsed.data.id, label: parsed.data.label, rawValueText: parsed.data.raw_value_text, valueState: parsed.data.value_state, amountText: parsed.data.amount_text, currencyCode: parsed.data.currency_code, basis: parsed.data.basis, scopeKind: parsed.data.scope_kind, scopeDescription: parsed.data.scope_description, confirmation: parsed.data.confirmation, observedAt: parsed.data.created_at,
    mapping: { state: parsed.data.mapping_state, projectId: parsed.data.project_id ?? selection.mapped_project_id ?? null, engagementId: parsed.data.engagement_id ?? selection.mapped_engagement_id ?? null, contractorId: parsed.data.party_id ?? selection.mapped_party_id ?? null },
    source: { id: source.id, code: source.code, title: source.title, sourceSystem: source.source_system }, version: { id: sourceVersion.id, versionNo: sourceVersion.version_no }, locator: selection.locator as CostSourceFigure['locator'],
  }
}
export type CostSourceReadRecord = ReturnType<typeof details>
function details(value: unknown) {
  const parsed = row.safeParse(value)
  if (!parsed.success) return databaseError()
  const selection = parsed.data.source_selections
  const contractorValue = party.safeParse(one(parsed.data.business_parties) ?? one(selection.business_parties))
  return {
    figure: map(parsed.data), originalFilename: selection.accounting_source_versions.original_filename,
    hierarchy: {
      project: project.safeParse(one(parsed.data.projects) ?? one(selection.projects)).data ?? null,
      engagement: project.safeParse(one(parsed.data.project_engagements) ?? one(selection.project_engagements)).data ?? null,
      contractor: contractorValue.success && contractorValue.data ? { id: contractorValue.data.id, code: contractorValue.data.code, displayName: contractorValue.data.display_name } : null,
    },
    openIssues: selection.source_review_issues.filter(issue => issue.status === 'open').map(issue => ({ issueKind: issue.issue_kind, impact: issue.impact, description: issue.description })),
    duplicateWarning: selection.source_review_issues.some(issue => issue.status === 'open' && ['possible_duplicate', 'coverage_overlap'].includes(issue.issue_kind)),
  }
}

export interface CostSourceReadRepository { probe(companyId: string): Promise<void>; figures(companyId: string, tenantId: string, query: CostSourceFiguresQuery): Promise<CostSourceReadRecord[]>; provenance(companyId: string, tenantId: string, figureId: string): Promise<CostSourceReadRecord | null> }
export function createSupabaseCostSourceReadRepository(db: UserSupabaseClient): CostSourceReadRepository {
  const client = db as unknown as Client
  async function figures(companyId: string, tenantId: string, input: CostSourceFiguresQuery) {
    let request = client.from('source_reported_figures').select(figureColumns).eq('tenant_id', tenantId).eq('company_id', companyId)
    if (input.cursor) request = request.gt('id', input.cursor)
    if (input.projectId) request = request.eq('project_id', input.projectId)
    if (input.sourceId) request = request.eq('source_selections.accounting_source_versions.source_id', input.sourceId)
    if (input.mappingState) request = request.eq('mapping_state', input.mappingState)
    if (input.confirmation) request = request.eq('confirmation', input.confirmation)
    if (input.engagementId) request = request.eq('engagement_id', input.engagementId)
    if (input.search) request = request.or(`label.ilike.%${input.search}%,source_selections.accounting_source_versions.accounting_sources.title.ilike.%${input.search}%`)
    const { data, error } = await request.order('id').limit(input.limit)
    const parsed = z.array(row).safeParse(data)
    if (error || !parsed.success) return databaseError()
    return parsed.data.map(details)
  }
  return {
    async probe(companyId) {
      const { error } = await client.rpc('c1_get_controlled_import_result', { target_company_id: companyId, target_run_id: probeRunId })
      const message = z.object({ code: z.string().optional(), message: z.string().optional() }).safeParse(error)
      if (!error || (message.success && message.data.message === 'RESOURCE_NOT_FOUND')) return
      if (message.success && message.data.code === 'P0001' && message.data.message === 'MODULE_DISABLED') throw new AppApiError(403, 'PERMISSION_DENIED', 'C1 chưa được bật cho công ty này.', { reason: 'MODULE_DISABLED' })
      if (message.success && message.data.code === 'P0001' && message.data.message === 'PERMISSION_DENIED') throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền đọc nguồn chi phí.', { reason: 'PERMISSION_DENIED' })
      return databaseError()
    },
    figures,
    async provenance(companyId, tenantId, figureId) {
      const { data, error } = await client.from('source_reported_figures').select(figureColumns).eq('tenant_id', tenantId).eq('company_id', companyId).eq('id', figureId).maybeSingle()
      if (error) return databaseError()
      return data === null ? null : details(data)
    },
  }
}
