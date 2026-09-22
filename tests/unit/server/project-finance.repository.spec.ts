import { describe, expect, it } from 'vitest'
import { FinanceReadLimitError, scanUuidRows } from '../../../server/features/costs/finance/read-pages'
import { ProjectFinanceMetadataReader, ProjectFinanceTableReader } from '../../../server/features/costs/finance/project-finance.queries'
import { ProjectFinanceReadRepository, createSupabaseProjectFinanceRepository } from '../../../server/features/costs/finance/project-finance.repository'

const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `${String(index + 1).padStart(8, '0')}-0000-4000-8000-000000000001` }))

describe('C1 finance bounded reads', () => {
  it('builds the overview from the concrete Supabase readers', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      gt: () => query,
      order: () => query,
      limit: async () => ({ data: [], error: null }),
    }
    const repository = createSupabaseProjectFinanceRepository({
      rpc: async name => name === 'c1_read_project_cost_read_context'
        ? { data: { projectId: '00000000-0000-4000-8000-000000000030', projectCode: 'P', projectName: 'Project', defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok' }, error: null }
        : name === 'c1_read_project_finance_directory'
          ? { data: { defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', projects: [], nextCursor: null }, error: null }
          : name === 'c1_read_project_finance_operational_states'
            ? { data: [{ projectId: '00000000-0000-4000-8000-000000000030', operationalState: 'unknown' }], error: null }
          : { data: [], error: null },
      from: () => query,
    } as never)
    const scope = { tenantId: '00000000-0000-4000-8000-000000000010', companyId: '00000000-0000-4000-8000-000000000020', permissions: ['cost.read'] }
    await expect(repository.overview(scope, '00000000-0000-4000-8000-000000000030')).resolves.toBeDefined()
    await expect(repository.listProjects(scope, { pageSize: 25 })).resolves.toMatchObject({ schemaVersion: 1, projects: [] })
    await expect(repository.budget(scope, '00000000-0000-4000-8000-000000000030')).resolves.toMatchObject({ state: 'not_recorded' })
    await expect(repository.ownerAdvances(scope, '00000000-0000-4000-8000-000000000030', { page: 1, pageSize: 25, sort: 'newest' })).resolves.toMatchObject({ recordedCount: 0 })
    await expect(repository.subcontractors(scope, '00000000-0000-4000-8000-000000000030')).resolves.toMatchObject({ coverage: 'not_recorded' })
  })

  it('continues after short backend-capped pages until an empty terminal page', async () => {
    const all = rows(1200)
    const result = await scanUuidRows(async (afterId, requestedSize) => {
      const start = afterId === null ? 0 : all.findIndex(row => row.id === afterId) + 1
      return all.slice(start, start + Math.min(requestedSize, 137))
    })
    expect(result).toHaveLength(1200)
  })

  it('rejects a duplicate or stuck cursor instead of returning a partial aggregate', async () => {
    await expect(scanUuidRows(async () => [{ id: '00000001-0000-4000-8000-000000000001' }, { id: '00000001-0000-4000-8000-000000000001' }])).rejects.toThrow('FINANCE_READ_CURSOR_INVALID')
  })

  it('fails closed at the resource guard', async () => {
    await expect(scanUuidRows(async (afterId) => afterId === null ? rows(2) : [], { pageSize: 2, maxRows: 1 })).rejects.toBeInstanceOf(FinanceReadLimitError)
  })

  it('uses bounded metadata RPCs and rejects missing requested party metadata', async () => {
    const calls: string[] = []
    const reader = new ProjectFinanceMetadataReader({
      rpc: async (name, args) => {
        calls.push(name)
        if (name === 'c1_read_project_finance_directory') return { data: { defaultCurrencyCode: 'VND', moneyScale: 4, timeZone: 'Asia/Bangkok', projects: [{ projectId: '00000000-0000-4000-8000-000000000001', projectCode: 'P', projectName: 'Project' }], nextCursor: null }, error: null }
        expect(args.target_party_ids).toEqual(['00000000-0000-4000-8000-000000000002'])
        return { data: [{ partyId: '00000000-0000-4000-8000-000000000002', code: 'S', displayName: 'Supplier', partyKind: 'organization' }], error: null }
      },
    })
    expect(await reader.directory('00000000-0000-4000-8000-000000000010', null, 25)).toMatchObject({ projects: [{ projectId: '00000000-0000-4000-8000-000000000001' }] })
    expect((await reader.parties('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', ['00000000-0000-4000-8000-000000000002']))[0]?.displayName).toBe('Supplier')
    expect(calls).toEqual(['c1_read_project_finance_directory', 'c1_read_project_finance_parties'])
  })

  it('reads canonical cost parents with explicit scope through complete keyset pages', async () => {
    const calls: Array<[string, string, unknown]> = []
    const all = [
      { id: '00000001-0000-4000-8000-000000000001', tenant_id: '00000000-0000-4000-8000-000000000010', company_id: '00000000-0000-4000-8000-000000000020', project_id: '00000000-0000-4000-8000-000000000030', cost_category_id: '00000000-0000-4000-8000-000000000040', description: 'presentation only', business_reference: null, amount_text: '1.0000', currency_code: 'VND', relevant_date: null, version: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
      { id: '00000002-0000-4000-8000-000000000001', tenant_id: '00000000-0000-4000-8000-000000000010', company_id: '00000000-0000-4000-8000-000000000020', project_id: '00000000-0000-4000-8000-000000000030', cost_category_id: null, description: 'not a classifier', business_reference: null, amount_text: '2.0000', currency_code: 'VND', relevant_date: null, version: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
    ]
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { calls.push(['eq', field, value]); return query },
      gt: (field: string, value: unknown) => { calls.push(['gt', field, value]); return query },
      order: () => query,
      limit: async () => ({ data: calls.filter(call => call[0] === 'gt').length === 0 ? all : [], error: null }),
    }
    const reader = new ProjectFinanceTableReader({ from: () => query } as never)
    expect(await reader.costItems('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000030')).toHaveLength(2)
    expect(calls).toContainEqual(['eq', 'tenant_id', '00000000-0000-4000-8000-000000000010'])
    expect(calls).toContainEqual(['eq', 'company_id', '00000000-0000-4000-8000-000000000020'])
  })

  it('retries the whole collection once when the read signature changes', async () => {
    let attempts = 0
    const repository = new ProjectFinanceReadRepository({
      read: async () => ({ signature: `v${++attempts}`, value: attempts }),
      consistent: value => value.signature === 'v2',
    })
    await expect(repository.collect()).resolves.toMatchObject({ value: 2 })
    expect(attempts).toBe(2)
  })

})
