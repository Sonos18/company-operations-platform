import { describe, expect, it, vi } from 'vitest'
import type { AppApiError } from '../../../server/utils/api-error'
import { createCostSourceReadService } from '../../../server/features/costs/source-read.service'
import { createSupabaseCostSourceReadRepository } from '../../../server/features/costs/source-read.repository'

const companyId = 'c1000000-0000-4000-8000-000000000020'
const tenantId = 'c1000000-0000-4000-8000-000000000010'
const figureId = 'c1000000-0000-4000-8000-000000000060'
const context = { companyId, tenantId, permissions: ['cost.source.read', 'cost.prepare'] as const }

function db({ rpcResult = { data: null, error: { code: 'P0001', message: 'RESOURCE_NOT_FOUND' } }, rows = [] as unknown[] } = {}) {
  const query = {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), ilike: vi.fn(), or: vi.fn(), gt: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(),
  }
  for (const method of ['select', 'eq', 'in', 'ilike', 'or', 'gt', 'order', 'limit'] as const) query[method].mockReturnValue(query)
  query.maybeSingle.mockResolvedValue({ data: rows[0] ?? null, error: null })
  query.limit.mockResolvedValue({ data: rows, error: null })
  return { client: { rpc: vi.fn().mockResolvedValue(rpcResult), from: vi.fn().mockReturnValue(query) }, query }
}

describe('cost source read model', () => {
  it.each([
    ['MODULE_DISABLED', 'MODULE_DISABLED'],
    ['PERMISSION_DENIED', 'PERMISSION_DENIED'],
  ])('maps probe %s to an explicit 403 reason', async (databaseMessage, reason) => {
    const { client } = db({ rpcResult: { data: null, error: { code: 'P0001', message: databaseMessage } } })
    const service = createCostSourceReadService(createSupabaseCostSourceReadRepository(client as never))

    await expect(service.overview(context)).rejects.toMatchObject<AppApiError>({ statusCode: 403, code: 'PERMISSION_DENIED', details: { reason } })
  })

  it('uses the non-existent probe before a company-scoped, bounded figure read without mutation methods', async () => {
    const { client, query } = db({ rows: [{
      id: figureId, tenant_id: tenantId, company_id: companyId, label: 'Certified amount', raw_value_text: '1,234.5000', value_state: 'known', amount_text: '1234.5000', currency_code: 'VND', basis: 'net', scope_kind: 'whole_project', mapping_state: 'confirmed', confirmation: 'unverified', version: 2, created_at: '2026-09-14T00:00:00.000Z',
      source_selections: { id: 'c1000000-0000-4000-8000-000000000061', locator: { kind: 'cell_range', sheetName: 'Costs', range: 'D7' }, mapped_project_id: 'c1000000-0000-4000-8000-000000000062', mapped_engagement_id: 'c1000000-0000-4000-8000-000000000063', accounting_source_versions: { id: 'c1000000-0000-4000-8000-000000000064', version_no: 1, original_filename: 'source.xlsx', accounting_sources: { id: 'c1000000-0000-4000-8000-000000000065', code: 'SRC-1', title: 'September source', source_system: 'xlsx' } } },
    }] })
    const service = createCostSourceReadService(createSupabaseCostSourceReadRepository(client as never))

    const result = await service.figures(context, { limit: 100, cursor: 'c1000000-0000-4000-8000-000000000050' })

    expect(client.rpc).toHaveBeenCalledWith('c1_get_controlled_import_result', { target_company_id: companyId, target_run_id: '00000000-0000-4000-8000-000000000001' })
    expect(query.eq).toHaveBeenCalledWith('tenant_id', tenantId)
    expect(query.eq).toHaveBeenCalledWith('company_id', companyId)
    expect(query.gt).toHaveBeenCalledWith('id', 'c1000000-0000-4000-8000-000000000050')
    expect(query.limit).toHaveBeenCalledWith(100)
    const columns = query.select.mock.calls[0]![0] as string
    expect(columns).toContain('project_engagements!mapped_engagement_id(id, code, name)')
    expect(columns).toContain('project_engagements!engagement_id(id, code, name)')
    expect(columns).not.toContain('source_selections_mapped_engagement_id_tenant_id_company_id_project_id_fkey')
    expect(columns).not.toContain('source_reported_figures_engagement_id_tenant_id_company_id_project_id_fkey')
    expect(result.items[0]).toMatchObject({ amountText: '1234.5000', rawValueText: '1,234.5000', source: { title: 'September source' } })
    expect(typeof result.items[0]!.amountText).toBe('string')
    expect(JSON.stringify(result)).not.toContain('amount":1234')
    expect(Object.keys(client)).not.toContain('insert')
    expect(Object.keys(query)).not.toEqual(expect.arrayContaining(['insert', 'update', 'upsert', 'delete']))
  })

  it('returns provenance only for the selected figure and only maps hierarchy carried by persisted mapping columns', async () => {
    const { client } = db({ rows: [{
      id: figureId, tenant_id: tenantId, company_id: companyId, label: 'Certified amount', raw_value_text: '1,234.5000', value_state: 'known', amount_text: '1234.5000', currency_code: 'VND', basis: 'net', scope_kind: 'whole_project', mapping_state: 'confirmed', confirmation: 'unverified', version: 2, created_at: '2026-09-14T00:00:00.000Z',
      source_selections: { id: 'c1000000-0000-4000-8000-000000000061', locator: { kind: 'cell_range', sheetName: 'Costs', range: 'D7' }, mapped_project_id: 'c1000000-0000-4000-8000-000000000062', mapped_engagement_id: 'c1000000-0000-4000-8000-000000000063', mapped_party_id: 'c1000000-0000-4000-8000-000000000064', accounting_source_versions: { id: 'c1000000-0000-4000-8000-000000000065', version_no: 1, original_filename: 'source.xlsx', accounting_sources: { id: 'c1000000-0000-4000-8000-000000000066', code: 'SRC-1', title: 'September source', source_system: 'xlsx' } }, projects: { id: 'c1000000-0000-4000-8000-000000000062', code: 'P-1', name: 'Mapped project' }, project_engagements: { id: 'c1000000-0000-4000-8000-000000000063', code: 'E-1', name: 'Mapped engagement' }, business_parties: { id: 'c1000000-0000-4000-8000-000000000064', code: 'B-1', display_name: 'Mapped contractor' }, source_review_issues: [{ issue_kind: 'possible_duplicate', impact: 'comparison_only', description: 'Potential duplicate', status: 'open' }] },
    }] })
    const service = createCostSourceReadService(createSupabaseCostSourceReadRepository(client as never))

    const result = await service.provenance(context, figureId)

    expect(result).toMatchObject({ originalFilename: 'source.xlsx', duplicateWarning: true, hierarchy: { project: { name: 'Mapped project' }, engagement: { name: 'Mapped engagement' }, contractor: { displayName: 'Mapped contractor' } } })
    expect(result).not.toHaveProperty('rawFileReference')
    expect(result).not.toHaveProperty('manifestSnapshot')
    expect(result.openIssues).toEqual([{ issueKind: 'possible_duplicate', impact: 'comparison_only', description: 'Potential duplicate' }])
  })

  it('builds project detail only from persisted mapped project, engagement, and contractor relations', async () => {
    const projectId = 'c1000000-0000-4000-8000-000000000062'
    const { client } = db({ rows: [{
      id: figureId, tenant_id: tenantId, company_id: companyId, label: 'Certified amount', raw_value_text: '1,234.5000', value_state: 'known', amount_text: '1234.5000', currency_code: 'VND', basis: 'net', scope_kind: 'whole_project', mapping_state: 'confirmed', confirmation: 'unverified', version: 2, created_at: '2026-09-14T00:00:00.000Z',
      source_selections: { id: 'c1000000-0000-4000-8000-000000000061', locator: { kind: 'cell_range', sheetName: 'Costs', range: 'D7' }, mapped_project_id: projectId, mapped_engagement_id: 'c1000000-0000-4000-8000-000000000063', mapped_party_id: 'c1000000-0000-4000-8000-000000000064', accounting_source_versions: { id: 'c1000000-0000-4000-8000-000000000065', version_no: 1, original_filename: 'source.xlsx', accounting_sources: { id: 'c1000000-0000-4000-8000-000000000066', code: 'SRC-1', title: 'September source', source_system: 'xlsx' } }, projects: { id: projectId, code: 'P-1', name: 'Mapped project' }, project_engagements: { id: 'c1000000-0000-4000-8000-000000000063', code: 'E-1', name: 'Mapped engagement' }, business_parties: { id: 'c1000000-0000-4000-8000-000000000064', code: 'B-1', display_name: 'Mapped contractor' } },
    }] })
    const service = createCostSourceReadService(createSupabaseCostSourceReadRepository(client as never))

    await expect(service.project(context, projectId)).resolves.toMatchObject({ project: { id: projectId, name: 'Mapped project' }, engagements: [{ engagement: { name: 'Mapped engagement' }, contractor: { displayName: 'Mapped contractor' } }] })
  })
})
