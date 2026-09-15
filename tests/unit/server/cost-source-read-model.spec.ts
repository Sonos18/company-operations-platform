import { describe, expect, it, vi } from 'vitest'
import type { AppApiError } from '../../../server/utils/api-error'
import { createCostSourceReadService } from '../../../server/features/costs/source-read.service'
import { createSupabaseCostSourceReadRepository } from '../../../server/features/costs/source-read.repository'

const companyId = 'c1000000-0000-4000-8000-000000000020'
const tenantId = 'c1000000-0000-4000-8000-000000000010'
const figureId = 'c1000000-0000-4000-8000-000000000060'
const context = { companyId, tenantId, permissions: ['cost.source.read', 'cost.prepare'] as const }
type HierarchyFixture = { id: string; code: string; name?: string; display_name?: string }
type RowFixture = { source_selections: { id: string; projects?: HierarchyFixture; project_engagements?: HierarchyFixture; business_parties?: HierarchyFixture }; projects?: HierarchyFixture; project_engagements?: HierarchyFixture; business_parties?: HierarchyFixture }

function db({ rpcResult = { data: {}, error: null }, rows = [] as RowFixture[] } = {}) {
  const query = {
    select: vi.fn(), eq: vi.fn(), in: vi.fn(), ilike: vi.fn(), or: vi.fn(), gt: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(),
  }
  for (const method of ['select', 'eq', 'in', 'ilike', 'or', 'gt', 'order', 'limit'] as const) query[method].mockReturnValue(query)
  query.maybeSingle.mockResolvedValue({ data: rows[0] ?? null, error: null })
  query.limit.mockResolvedValue({ data: rows, error: null })
  const hierarchy = rows.map(row => {
    const selection = row.source_selections
    const project = row.projects ?? selection.projects
    const engagement = row.project_engagements ?? selection.project_engagements
    const contractor = row.business_parties ?? selection.business_parties
    return { source_selection_id: selection.id, project_id: project?.id ?? null, project_code: project?.code ?? null, project_name: project?.name ?? null, engagement_id: engagement?.id ?? null, engagement_code: engagement?.code ?? null, engagement_name: engagement?.name ?? null, contractor_id: contractor?.id ?? null, contractor_code: contractor?.code ?? null, contractor_display_name: contractor?.display_name ?? null }
  })
  return { client: { rpc: vi.fn((name: string) => Promise.resolve(name === 'c1_read_cost_source_hierarchy' ? { data: hierarchy, error: null } : rpcResult)), from: vi.fn().mockReturnValue(query) }, query }
}

describe('cost source read model', () => {
  it('uses the source-read probe and selection-scoped hierarchy RPC instead of master-table embeds', async () => {
    const hierarchy = [{ source_selection_id: 'c1000000-0000-4000-8000-000000000061', project_id: 'c1000000-0000-4000-8000-000000000062', project_code: 'P-1', project_name: 'Mapped project', engagement_id: 'c1000000-0000-4000-8000-000000000063', engagement_code: 'E-1', engagement_name: 'Mapped engagement', contractor_id: 'c1000000-0000-4000-8000-000000000064', contractor_code: 'B-1', contractor_display_name: 'Mapped contractor' }]
    const { client, query } = db({ rows: [{
      id: figureId, tenant_id: tenantId, company_id: companyId, label: 'Certified amount', raw_value_text: '1,234.5000', value_state: 'known', amount_text: '1234.5000', currency_code: 'VND', basis: 'net', scope_kind: 'whole_project', mapping_state: 'confirmed', confirmation: 'unverified', created_at: '2026-09-14T16:04:25.685407+00:00',
      source_selections: { id: hierarchy[0]!.source_selection_id, locator: { kind: 'cell_range', sheetName: 'Costs', range: 'D7' }, mapped_project_id: hierarchy[0]!.project_id, mapped_engagement_id: hierarchy[0]!.engagement_id, mapped_party_id: hierarchy[0]!.contractor_id, accounting_source_versions: { id: 'c1000000-0000-4000-8000-000000000065', version_no: 1, original_filename: 'source.xlsx', accounting_sources: { id: 'c1000000-0000-4000-8000-000000000066', code: 'SRC-1', title: 'September source', source_system: 'xlsx' } }, source_review_issues: [] },
    }] })
    client.rpc.mockImplementation((name: string) => Promise.resolve(name === 'c1_read_cost_source_hierarchy' ? { data: hierarchy, error: null } : { data: { companyId }, error: null }))
    const repository = createSupabaseCostSourceReadRepository(client as never)

    await expect(repository.provenance(companyId, tenantId, figureId)).resolves.toMatchObject({ hierarchy: { project: { name: 'Mapped project' }, engagement: { name: 'Mapped engagement' }, contractor: { displayName: 'Mapped contractor' } } })
    expect(client.rpc).toHaveBeenCalledWith('c1_read_cost_source_hierarchy', { target_company_id: companyId })
    const columns = query.select.mock.calls[0]![0] as string
    expect(columns).not.toMatch(/(?:projects|project_engagements|business_parties)!/u)
  })

  it.each([
    ['MODULE_DISABLED', 'MODULE_DISABLED'],
    ['PERMISSION_DENIED', 'PERMISSION_DENIED'],
  ])('maps probe %s to an explicit 403 reason', async (databaseMessage, reason) => {
    const { client } = db({ rpcResult: { data: null, error: { code: 'P0001', message: databaseMessage } } })
    const service = createCostSourceReadService(createSupabaseCostSourceReadRepository(client as never))

    await expect(service.overview(context)).rejects.toMatchObject<AppApiError>({ statusCode: 403, code: 'PERMISSION_DENIED', details: { reason } })
  })

  it('uses the read-only probe before a company-scoped, bounded figure read without mutation methods', async () => {
    const { client, query } = db({ rows: [{
      id: figureId, tenant_id: tenantId, company_id: companyId, label: 'Certified amount', raw_value_text: '1,234.5000', value_state: 'known', amount_text: '1234.5000', currency_code: 'VND', basis: 'net', scope_kind: 'whole_project', mapping_state: 'confirmed', confirmation: 'unverified', version: 2, created_at: '2026-09-14T16:04:25.685407+00:00',
      source_selections: { id: 'c1000000-0000-4000-8000-000000000061', locator: { kind: 'cell_range', sheetName: 'Costs', range: 'D7' }, mapped_project_id: 'c1000000-0000-4000-8000-000000000062', mapped_engagement_id: 'c1000000-0000-4000-8000-000000000063', accounting_source_versions: { id: 'c1000000-0000-4000-8000-000000000064', version_no: 1, original_filename: 'source.xlsx', accounting_sources: { id: 'c1000000-0000-4000-8000-000000000065', code: 'SRC-1', title: 'September source', source_system: 'xlsx' } } },
    }] })
    const service = createCostSourceReadService(createSupabaseCostSourceReadRepository(client as never))

    const result = await service.figures(context, { limit: 100, cursor: 'c1000000-0000-4000-8000-000000000050' })

    expect(client.rpc).toHaveBeenCalledWith('c1_probe_cost_source_read', { target_company_id: companyId })
    expect(query.eq).toHaveBeenCalledWith('tenant_id', tenantId)
    expect(query.eq).toHaveBeenCalledWith('company_id', companyId)
    expect(query.gt).toHaveBeenCalledWith('id', 'c1000000-0000-4000-8000-000000000050')
    expect(query.limit).toHaveBeenCalledWith(100)
    const columns = query.select.mock.calls[0]![0] as string
    expect(columns).toContain('source_review_issues(issue_kind, impact, description, status)')
    expect(columns).not.toMatch(/(?:projects|project_engagements|business_parties)!/u)
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
