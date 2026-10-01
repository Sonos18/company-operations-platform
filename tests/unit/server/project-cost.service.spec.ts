import { describe, expect, it, vi } from 'vitest'
import { ProjectCostRepository } from '../../../server/features/costs/project-cost.repository'
import { ProjectCostService } from '../../../server/features/costs/project-cost.service'

const context = (permissions: string[]) => ({ actorId: 'c1010000-0000-4000-8000-000000000902', tenantId: 'c1010000-0000-4000-8000-000000000010', companyId: 'c1010000-0000-4000-8000-000000000020', permissions, requestId: 'c1010000-0000-4000-8000-000000000999' })
const createInput = { projectId: 'c1010000-0000-4000-8000-000000000101', description: 'Synthetic', amount: '1.00', currencyCode: 'VND', workStatus: 'unknown' as const, nonOverlapConfirmationReference: 'confirmed' }
const itemRow = (overrides: Record<string, unknown> = {}) => ({ id: 'c1010000-0000-4000-8000-000000000001', tenant_id: 'c1010000-0000-4000-8000-000000000010', company_id: 'c1010000-0000-4000-8000-000000000020', project_id: 'c1010000-0000-4000-8000-000000000101', publication_origin: 'legacy_backfill', description: 'Synthetic', amount_text: '1.0000', currency_code: 'VND', work_status: 'unknown', business_reference: null, party_id: null, engagement_id: null, component_id: null, relevant_date: null, version: 0, created_by: 'c1010000-0000-4000-8000-000000000902', created_at: '2026-09-16T00:00:00.000Z', updated_at: '2026-09-16T00:00:00.000Z', ...overrides })
const metadata = (projectId: string) => ({ projectId, projectCode: projectId.endsWith('102') ? 'C101-P2' : 'C101-P1', projectName: projectId.endsWith('102') ? 'C101 project two' : 'C101 project one' })
const listClient = (data: unknown, error: unknown = null) => {
  const result = Promise.resolve({ data, error })
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), then: result.then.bind(result) }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.order.mockReturnValue(query)
  const select = query.select
  const from = vi.fn().mockReturnValue({ select })
  const projectIds = Array.isArray(data) ? [...new Set(data.map(row => (row as { project_id: string }).project_id))] : []
  const rpc = vi.fn().mockResolvedValue({ data: projectIds.map(metadata), error: null })
  return { from, select, query, rpc }
}

describe('Project Cost service', () => {
  const observationClient = (parents: ReturnType<typeof itemRow>[], children: Record<string, unknown>[] = [], beforeRead?: (table: string) => void) => ({
    from: (table: string) => {
      const filters: Array<[string, string]> = []
      let maximum = Infinity
      let columns: string[] = []
      const query = {
        select: (value: string) => { columns = value.split(','); return query },
        eq: (key: string, value: string) => { filters.push([key, value]); return query },
        order: () => query,
        limit: (size: number) => { maximum = size; return query },
        then: (resolve: (value: unknown) => unknown) => { beforeRead?.(table); return Promise.resolve({ data: (table === 'project_cost_items' ? parents : children).filter(row => filters.every(([key, value]) => (row as Record<string, unknown>)[key] === value)).slice(0, maximum).map(row => Object.fromEntries(columns.map(key => [key, (row as Record<string, unknown>)[key]]))), error: null }).then(resolve) },
      }
      return query
    },
    rpc: async (_name: string, args: { target_project_ids: string[] }) => ({ data: args.target_project_ids.map(metadata), error: null }),
  })

  it.each(['VND', 'USD'])('omits a draft-only %s shell from old list and project reads', async currency => {
    const legacy = itemRow({ publication_state: 'published', publication_origin: 'legacy_backfill' })
    const shell = itemRow({ id: 'c1010000-0000-4000-8000-000000000002', amount_text: '0.0000', currency_code: currency, publication_state: 'published', publication_origin: 'command' })
    const repository = new ProjectCostRepository(observationClient([legacy, shell]) as never)
    expect(await repository.listSummaries(legacy.tenant_id, legacy.company_id)).toMatchObject([{ summary: { unknownCount: 1, currencyCode: 'VND' } }])
    expect(await repository.projectSummary(legacy.tenant_id, legacy.company_id, legacy.project_id)).toMatchObject({ items: [{ id: legacy.id }], summary: { unknownCount: 1, currencyCode: 'VND' } })
  })

  it('preserves empty list and missing project for a first draft shell', async () => {
    const shell = itemRow({ amount_text: '0.0000', publication_state: 'published', publication_origin: 'command' })
    const draft = { id: 'c1010000-0000-4000-8000-000000000004', tenant_id: shell.tenant_id, company_id: shell.company_id, project_cost_item_id: shell.id, publication_state: 'draft' }
    const repository = new ProjectCostRepository(observationClient([shell], [draft]) as never)
    await expect(repository.listSummaries(shell.tenant_id, shell.company_id)).resolves.toEqual([])
    await expect(repository.projectSummary(shell.tenant_id, shell.company_id, shell.project_id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(repository.itemDetails(shell.tenant_id, shell.company_id, shell.id)).resolves.toMatchObject({ details: [] })
  })

  it.each(['list', 'project'])('refreshes a zero shell published between parent and child reads in the %s API', async api => {
    const parent = itemRow({ amount_text: '0.0000', publication_state: 'published', publication_origin: 'command' })
    const child = { id: 'c1010000-0000-4000-8000-000000000004', tenant_id: parent.tenant_id, company_id: parent.company_id, project_cost_item_id: parent.id, publication_state: 'published' }
    const repository = new ProjectCostRepository(observationClient([parent], [child], table => {
      if (table === 'project_cost_item_details') { parent.amount_text = '10.0000'; parent.version = 1 }
    }) as never)
    if (api === 'list') {
      expect(await repository.listSummaries(parent.tenant_id, parent.company_id)).toMatchObject([{ summary: { unknownCount: 1, unknownStatusValue: '10.0000' } }])
    } else {
      expect(await repository.projectSummary(parent.tenant_id, parent.company_id, parent.project_id)).toMatchObject({ summary: { unknownCount: 1, unknownStatusValue: '10.0000' }, items: [{ amount: '10.0000', version: 1 }] })
    }
  })

  it('finds each published zero independently of other parents and out-of-scope children', async () => {
    const first = itemRow({ amount_text: '0.0000', publication_state: 'published', publication_origin: 'command' })
    const second = { ...first, id: 'c1010000-0000-4000-8000-000000000002' }
    const shell = { ...first, id: 'c1010000-0000-4000-8000-000000000003' }
    const evidence = (parent: typeof first) => ({ id: 'c1010000-0000-4000-8000-000000000004', tenant_id: parent.tenant_id, company_id: parent.company_id, project_cost_item_id: parent.id, publication_state: 'published' })
    const children = [...Array.from({ length: 1001 }, () => evidence(first)), evidence(second), { ...evidence(shell), company_id: 'c1010000-0000-4000-8000-000000000099' }]
    const repository = new ProjectCostRepository(observationClient([first, second, shell], children) as never)
    const result = await repository.projectSummary(first.tenant_id, first.company_id, first.project_id)
    expect(result.items.map(item => item.id)).toEqual([first.id, second.id])
    expect(result.summary.unknownCount).toBe(2)
  })

  it.each([['legacy_backfill', '0.0000', false], ['legacy_backfill', '12.0000', false], ['command', '12.0000', false], ['command', '0.0000', true]])('keeps %s %s observations with published-child evidence %s', async (origin, amount, publishedChild) => {
    const parent = itemRow({ amount_text: amount, publication_state: 'published', publication_origin: origin })
    const children = [
      { id: 'c1010000-0000-4000-8000-000000000003', tenant_id: parent.tenant_id, company_id: parent.company_id, project_cost_item_id: parent.id, publication_state: 'draft' },
      ...(publishedChild ? [{ id: 'c1010000-0000-4000-8000-000000000004', tenant_id: parent.tenant_id, company_id: parent.company_id, project_cost_item_id: parent.id, publication_state: 'published' }] : []),
    ]
    const repository = new ProjectCostRepository(observationClient([parent], children) as never)
    expect(await repository.listSummaries(parent.tenant_id, parent.company_id)).toMatchObject([{ summary: { unknownCount: 1, unknownStatusValue: amount } }])
    expect(await repository.projectSummary(parent.tenant_id, parent.company_id, parent.project_id)).toMatchObject({ items: [{ id: parent.id }] })
  })

  it.each(['COST_DETAIL_ALREADY_PUBLISHED', 'COST_DETAIL_NOT_DRAFT', 'HISTORY_IMMUTABLE'] as const)('maps the PostgREST %s conflict with null details when publishing a detail', async code => {
    const repository = new ProjectCostRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: code, details: null, hint: null } }) } as never)
    await expect(repository.publishDetail(context([]), itemRow().id, { expectedVersion: 0 }, context([]).requestId)).rejects.toMatchObject({ statusCode: 409, code })
  })

  it.each(['cost.manage', 'cost.prepare'] as const)('allows %s to read narrow draft-management metadata', async permission => {
    const repository = { draftManagementMetadata: vi.fn().mockResolvedValue({ projects: [], categories: [] }) }
    await expect(new ProjectCostService(repository as never).draftManagementMetadata(context([permission]))).resolves.toEqual({ projects: [], categories: [] })
    expect(repository.draftManagementMetadata).toHaveBeenCalledWith(expect.objectContaining({ companyId: context([]).companyId }))
  })

  it.each(['cost.read', 'cost.source.read', 'cost.file.read', 'cost.publish_import', 'cost.correct', 'cost.record_cash'] as const)('does not let %s read draft-management metadata', async permission => {
    const repository = { draftManagementMetadata: vi.fn() }
    await expect(new ProjectCostService(repository as never).draftManagementMetadata(context([permission]))).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(repository.draftManagementMetadata).not.toHaveBeenCalled()
  })

  it.each(['cost.manage', 'cost.prepare', 'cost.publish_import', 'cost.record_cash'] as const)('does not let %s substitute for cost.correct on published correction', async permission => {
    const repository = { correctPublished: vi.fn() }
    await expect(new ProjectCostService(repository as never).correctPublished(context([permission]), itemRow().id, { expectedVersion: 2, reason: 'Correct source', operationalChanges: { workStatus: 'accepted' } }, context([]).requestId)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(repository.correctPublished).not.toHaveBeenCalled()
  })

  it('routes published correction only under cost.correct', async () => {
    const input = { expectedVersion: 2, reason: 'Correct source', operationalChanges: { workStatus: 'accepted' } }
    const repository = { correctPublished: vi.fn().mockResolvedValue({ id: itemRow().id, version: 3, publicationState: 'published', replayed: false }) }
    await new ProjectCostService(repository as never).correctPublished(context(['cost.correct']), itemRow().id, input, context([]).requestId)
    expect(repository.correctPublished).toHaveBeenCalledWith(expect.objectContaining({ companyId: context([]).companyId }), itemRow().id, expect.objectContaining(input), context([]).requestId)
  })

  it('keeps ordinary detail create, prepare, and publish behind separate permissions', async () => {
    const repository = { createDetailDraft: vi.fn(), prepareDetailFinancials: vi.fn(), publishDetail: vi.fn() }
    const service = new ProjectCostService(repository as never)
    const id = itemRow().id
    const projectId = itemRow().project_id
    const requestId = context([]).requestId
    const draft = { categoryId: 'c1010000-0000-4000-8000-000000000301', description: 'Ordinary detail' }

    await service.createDetailDraft(context(['cost.manage']), projectId, draft, requestId)
    await service.prepareDetailFinancials(context(['cost.prepare']), id, { expectedVersion: 0, amount: '2.0000' })
    await service.publishDetail(context(['cost.publish_import']), id, { expectedVersion: 1 }, requestId)
    expect(repository.createDetailDraft).toHaveBeenCalledOnce()
    expect(repository.prepareDetailFinancials).toHaveBeenCalledOnce()
    expect(repository.publishDetail).toHaveBeenCalledOnce()

    await expect(service.createDetailDraft(context(['cost.prepare']), projectId, draft, requestId)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await expect(service.prepareDetailFinancials(context(['cost.manage']), id, { expectedVersion: 0, amount: '2.0000' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await expect(service.publishDetail(context(['cost.manage']), id, { expectedVersion: 1 }, requestId)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(repository.createDetailDraft).toHaveBeenCalledOnce()
    expect(repository.prepareDetailFinancials).toHaveBeenCalledOnce()
    expect(repository.publishDetail).toHaveBeenCalledOnce()
  })

  it('maps a snake_case database row to the public project cost item without losing decimal text', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: [metadata('c1010000-0000-4000-8000-000000000101')], error: null }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ id: 'c1010000-0000-4000-8000-000000000001', tenant_id: 'c1010000-0000-4000-8000-000000000010', company_id: 'c1010000-0000-4000-8000-000000000020', project_id: 'c1010000-0000-4000-8000-000000000101', publication_origin: 'legacy_backfill', description: 'Synthetic', amount_text: '9007199254740993.0000', currency_code: 'VND', work_status: 'accepted', business_reference: null, party_id: null, engagement_id: null, component_id: null, relevant_date: null, version: 2, created_by: 'c1010000-0000-4000-8000-000000000902', created_at: '2026-09-16T00:00:00.000Z', updated_at: '2026-09-16T00:00:00.000Z' }], error: null }) }),
                }),
              }),
            }),
          }),
        }),
      }),
    }
    const repository = new ProjectCostRepository(client as never)

    await expect(repository.projectSummary(context(['cost.read']).tenantId, context(['cost.read']).companyId, 'c1010000-0000-4000-8000-000000000101')).resolves.toMatchObject({ items: [expect.objectContaining({ projectId: 'c1010000-0000-4000-8000-000000000101', amount: '9007199254740993.0000', currencyCode: 'VND', workStatus: 'accepted', version: 2 })] })
    expect(client.from.mock.results[0].value.select).toHaveBeenCalledWith(expect.not.stringContaining('*'))
  })

  it('filters project cost reads by tenant, company, and project', async () => {
    const client = listClient([itemRow()])
    const repository = new ProjectCostRepository(client as never)

    await repository.projectSummary(context([]).tenantId, context([]).companyId, createInput.projectId)

    expect(client.from).toHaveBeenCalledWith('project_cost_items')
    expect(client.select).toHaveBeenCalledWith(expect.not.stringContaining('*'))
    expect(client.query.eq).toHaveBeenCalledWith('tenant_id', context([]).tenantId)
    expect(client.query.eq).toHaveBeenCalledWith('company_id', context([]).companyId)
    expect(client.query.eq).toHaveBeenCalledWith('project_id', createInput.projectId)
    expect(client.query.eq).toHaveBeenCalledWith('publication_state', 'published')
  })

  it('aggregates accepted and in-progress values, excludes unknown from total, and counts zero values', async () => {
    const client = listClient([
      itemRow({ id: 'c1010000-0000-4000-8000-000000000011', amount_text: '0.0000', work_status: 'accepted' }),
      itemRow({ id: 'c1010000-0000-4000-8000-000000000012', amount_text: '2.5000', work_status: 'in_progress' }),
      itemRow({ id: 'c1010000-0000-4000-8000-000000000013', amount_text: '7.0000', work_status: 'unknown' }),
    ])
    const repository = new ProjectCostRepository(client as never)

    await expect(repository.listSummaries(context([]).tenantId, context([]).companyId)).resolves.toEqual([{ ...metadata(createInput.projectId), summary: { currencyCode: 'VND', acceptedValue: '0.0000', acceptedCount: 1, inProgressValue: '2.5000', inProgressCount: 1, unknownStatusValue: '7.0000', unknownCount: 1, totalTrackedWorkValue: '2.5000' } }])
  })

  it('isolates mixed-order multi-project aggregates and returns deterministic project ordering', async () => {
    const projectB = 'c1010000-0000-4000-8000-000000000102'
    const repository = new ProjectCostRepository(listClient([
      itemRow({ id: 'c1010000-0000-4000-8000-000000000021', project_id: projectB, amount_text: '2.0000', work_status: 'unknown' }),
      itemRow({ id: 'c1010000-0000-4000-8000-000000000022', project_id: createInput.projectId, amount_text: '20.0000', work_status: 'unknown' }),
      itemRow({ id: 'c1010000-0000-4000-8000-000000000023', project_id: projectB, amount_text: '5.0000', work_status: 'in_progress' }),
      itemRow({ id: 'c1010000-0000-4000-8000-000000000024', project_id: createInput.projectId, amount_text: '50.0000', work_status: 'in_progress' }),
      itemRow({ id: 'c1010000-0000-4000-8000-000000000025', project_id: projectB, amount_text: '10.0000', work_status: 'accepted' }),
      itemRow({ id: 'c1010000-0000-4000-8000-000000000026', project_id: createInput.projectId, amount_text: '100.0000', work_status: 'accepted' }),
    ]) as never)

    await expect(repository.listSummaries(context([]).tenantId, context([]).companyId)).resolves.toEqual([
      { ...metadata(createInput.projectId), summary: { currencyCode: 'VND', acceptedValue: '100.0000', acceptedCount: 1, inProgressValue: '50.0000', inProgressCount: 1, unknownStatusValue: '20.0000', unknownCount: 1, totalTrackedWorkValue: '150.0000' } },
      { ...metadata(projectB), summary: { currencyCode: 'VND', acceptedValue: '10.0000', acceptedCount: 1, inProgressValue: '5.0000', inProgressCount: 1, unknownStatusValue: '2.0000', unknownCount: 1, totalTrackedWorkValue: '15.0000' } },
    ])
  })

  it('derives independent summary currencies from persisted Project Cost rows', async () => {
    const projectB = 'c1010000-0000-4000-8000-000000000102'
    const repository = new ProjectCostRepository(listClient([itemRow({ currency_code: 'VND' }), itemRow({ id: 'c1010000-0000-4000-8000-000000000002', project_id: projectB, currency_code: 'USD' })]) as never)
    await expect(repository.listSummaries(context([]).tenantId, context([]).companyId)).resolves.toMatchObject([
      { projectId: createInput.projectId, summary: { currencyCode: 'VND' } },
      { projectId: projectB, summary: { currencyCode: 'USD' } },
    ])
  })

  it('enriches distinct Project Cost summaries through one metadata RPC call', async () => {
    const projectB = 'c1010000-0000-4000-8000-000000000102'
    const client = listClient([itemRow(), itemRow({ id: 'c1010000-0000-4000-8000-000000000002', project_id: projectB })])
    const repository = new ProjectCostRepository(client as never)

    await expect(repository.listSummaries(context([]).tenantId, context([]).companyId)).resolves.toMatchObject([
      { ...metadata(createInput.projectId) },
      { ...metadata(projectB) },
    ])
    expect(client.rpc).toHaveBeenCalledWith('c1_read_project_cost_project_metadata', { target_company_id: context([]).companyId, target_project_ids: expect.arrayContaining([createInput.projectId, projectB]) })
    expect(client.rpc).toHaveBeenCalledOnce()
  })

  it('returns an empty summary list without a metadata RPC call', async () => {
    const client = listClient([])

    await expect(new ProjectCostRepository(client as never).listSummaries(context([]).tenantId, context([]).companyId)).resolves.toEqual([])
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('fails closed for an empty Project Cost detail or inconsistent metadata', async () => {
    const empty = listClient([])
    await expect(new ProjectCostRepository(empty as never).projectSummary(context([]).tenantId, context([]).companyId, createInput.projectId)).rejects.toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' })

    for (const metadataResponse of [[], [metadata(createInput.projectId), metadata(createInput.projectId)], [metadata('c1010000-0000-4000-8000-000000000102')]]) {
      const client = listClient([itemRow()])
      client.rpc.mockResolvedValue({ data: metadataResponse, error: null })
      await expect(new ProjectCostRepository(client as never).projectSummary(context([]).tenantId, context([]).companyId, createInput.projectId)).rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
    }
  })

  it('fails closed for summary metadata mismatches and preserves metadata RPC permission failures', async () => {
    for (const metadataResponse of [[], [metadata(createInput.projectId), metadata(createInput.projectId)], [metadata('c1010000-0000-4000-8000-000000000102')], [{ ...metadata(createInput.projectId), operationalState: 'forbidden' }]]) {
      const client = listClient([itemRow()])
      client.rpc.mockResolvedValue({ data: metadataResponse, error: null })
      await expect(new ProjectCostRepository(client as never).listSummaries(context([]).tenantId, context([]).companyId)).rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
    }

    const client = listClient([itemRow()])
    client.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'PERMISSION_DENIED' } })
    await expect(new ProjectCostRepository(client as never).listSummaries(context([]).tenantId, context([]).companyId)).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
  })

  it('reads aggregation from project_cost_items without source or provenance queries', async () => {
    const client = listClient([itemRow()])
    const repository = new ProjectCostRepository(client as never)

    await repository.listSummaries(context([]).tenantId, context([]).companyId)

    expect(client.from).toHaveBeenCalledTimes(1)
    expect(client.from).toHaveBeenCalledWith('project_cost_items')
  })

  it('rejects mixed-currency project cost summaries as INTERNAL_ERROR', async () => {
    const repository = new ProjectCostRepository(listClient([itemRow(), itemRow({ id: 'c1010000-0000-4000-8000-000000000012', currency_code: 'USD' })]) as never)

    await expect(repository.listSummaries(context([]).tenantId, context([]).companyId)).rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
  })

  it('maps MODULE_DISABLED read errors before data parsing on both read paths', async () => {
    const error = { code: 'P0001', message: 'MODULE_DISABLED' }
    const listRepository = new ProjectCostRepository(listClient(null, error) as never)
    const summaryRepository = new ProjectCostRepository(listClient(null, error) as never)
    const expected = { statusCode: 403, code: 'PERMISSION_DENIED', details: { reason: 'MODULE_DISABLED' } }

    await expect(listRepository.listSummaries(context([]).tenantId, context([]).companyId)).rejects.toMatchObject(expected)
    await expect(summaryRepository.projectSummary(context([]).tenantId, context([]).companyId, createInput.projectId)).rejects.toMatchObject(expected)
  })

  it('requires cost.read before summary access', async () => {
    const repository = { listSummaries: vi.fn() }
    const service = new ProjectCostService(repository as never)
    await expect(service.listSummaries(context([]))).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(repository.listSummaries).not.toHaveBeenCalled()
  })

  it('allows cost.read summary access without a write permission', async () => {
    const repository = { projectSummary: vi.fn().mockResolvedValue({ projectId: createInput.projectId, summary: {}, items: [] }) }
    const service = new ProjectCostService(repository as never)

    await expect(service.projectSummary(context(['cost.read']), createInput.projectId)).resolves.toMatchObject({ projectId: createInput.projectId })
    expect(repository.projectSummary).toHaveBeenCalledWith(context([]).tenantId, context([]).companyId, createInput.projectId)
  })

  it.each([['cost.manage'], ['cost.correct']])('does not treat %s as independent read access', async permission => {
    const repository = { listSummaries: vi.fn(), projectSummary: vi.fn() }
    const service = new ProjectCostService(repository as never)

    await expect(service.listSummaries(context([permission]))).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    await expect(service.projectSummary(context([permission]), createInput.projectId)).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(repository.listSummaries).not.toHaveBeenCalled()
    expect(repository.projectSummary).not.toHaveBeenCalled()
  })

  it('accepts PostgreSQL timestamptz with explicit timezone offsets in listSummaries', async () => {
    const row = itemRow({
      created_at: '2026-09-17T07:45:34.829269+00:00',
      updated_at: '2026-09-17T07:45:34.829269+00:00',
    })
    const repository = new ProjectCostRepository(listClient([row]) as never)

    await expect(repository.listSummaries(context([]).tenantId, context([]).companyId)).resolves.toEqual([
      {
        ...metadata(createInput.projectId),
        summary: {
          currencyCode: 'VND',
          acceptedValue: '0.0000',
          acceptedCount: 0,
          inProgressValue: '0.0000',
          inProgressCount: 0,
          unknownStatusValue: '1.0000',
          unknownCount: 1,
          totalTrackedWorkValue: '0.0000',
        },
      },
    ])
  })

  it('accepts PostgreSQL timestamptz with explicit timezone offsets in projectSummary', async () => {
    const row = itemRow({
      created_at: '2026-09-17T07:45:34.829269+00:00',
      updated_at: '2026-09-17T07:45:34.829269+00:00',
    })
    const repository = new ProjectCostRepository(listClient([row]) as never)

    await expect(repository.projectSummary(context([]).tenantId, context([]).companyId, createInput.projectId)).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          createdAt: '2026-09-17T07:45:34.829269+00:00',
          updatedAt: '2026-09-17T07:45:34.829269+00:00',
        }),
      ],
    })
  })

  describe('itemDetails', () => {
    const parentRow = {
      id: 'c1010000-0000-4000-8000-000000000001',
      tenant_id: 'c1010000-0000-4000-8000-000000000010',
      company_id: 'c1010000-0000-4000-8000-000000000020',
      amount_text: '100.0000',
      currency_code: 'VND',
    }
    const makeDetailRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'c1010000-0000-4000-8000-000000000031',
      tenant_id: 'c1010000-0000-4000-8000-000000000010',
      company_id: 'c1010000-0000-4000-8000-000000000020',
      project_cost_item_id: parentRow.id,
      line_no: 1,
      detail_kind: 'line_item',
      description: 'Lắp đặt cốp pha',
      quantity_text: '10.0000',
      unit_code: 'm2',
      unit_price_text: '10.0000',
      amount_text: '100.0000',
      retention_kind: null,
      retention_rate_bps: null,
      retention_amount_text: null,
      relevant_date: '2026-09-17',
      reference: 'BB-01',
      note: 'Ghi chú',
      version: 0,
      created_by: 'c1010000-0000-4000-8000-000000000902',
      created_at: '2026-09-17T07:45:34.829269+00:00',
      updated_at: '2026-09-17T07:45:34.829269+00:00',
      ...overrides,
    })

    const makeDetailsClient = (parentData: unknown, detailsData: unknown, parentError: unknown = null, detailsError: unknown = null) => {
      const parentQuery: Record<string, unknown> = {
        select: vi.fn(),
        eq: vi.fn(),
        then: Promise.resolve({ data: parentData, error: parentError }).then.bind(Promise.resolve({ data: parentData, error: parentError })),
      }
      parentQuery.select = vi.fn().mockReturnValue(parentQuery)
      parentQuery.eq = vi.fn().mockReturnValue(parentQuery)

      const detailsQuery: Record<string, unknown> = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        then: Promise.resolve({ data: detailsData, error: detailsError }).then.bind(Promise.resolve({ data: detailsData, error: detailsError })),
      }
      detailsQuery.select = vi.fn().mockReturnValue(detailsQuery)
      detailsQuery.eq = vi.fn().mockReturnValue(detailsQuery)
      detailsQuery.order = vi.fn().mockReturnValue(detailsQuery)

      const from = vi.fn().mockImplementation((table: string) => {
        if (table === 'project_cost_items') return parentQuery
        if (table === 'project_cost_item_details') return detailsQuery
        throw new Error(`Unexpected table: ${table}`)
      })
      return { from, parentQuery, detailsQuery }
    }

    it('requires cost.read permission to read item details', async () => {
      const repository = { itemDetails: vi.fn() }
      const service = new ProjectCostService(repository as never)

      await expect(service.itemDetails(context([]), parentRow.id)).rejects.toMatchObject({
        statusCode: 403,
        code: 'PERMISSION_DENIED',
      })
      expect(repository.itemDetails).not.toHaveBeenCalled()
    })

    it('allows cost.read to get detail list with parent metadata and mapped details', async () => {
      const client = makeDetailsClient([parentRow], [makeDetailRow()])
      const repository = new ProjectCostRepository(client as never)
      const service = new ProjectCostService(repository)

      const result = await service.itemDetails(context(['cost.read']), parentRow.id)
      expect(result).toEqual({
        projectCostItemId: parentRow.id,
        totalAmount: '100.0000',
        currencyCode: 'VND',
        details: [
          {
            id: 'c1010000-0000-4000-8000-000000000031',
            projectCostItemId: parentRow.id,
            lineNo: 1,
            detailKind: 'line_item',
            description: 'Lắp đặt cốp pha',
            quantity: '10.0000',
            unitCode: 'm2',
            unitPrice: '10.0000',
            amount: '100.0000',
            retentionKind: null,
            retentionRateBps: null,
            retentionAmount: null,
            relevantDate: '2026-09-17',
            reference: 'BB-01',
            note: 'Ghi chú',
            version: 0,
            createdAt: '2026-09-17T07:45:34.829269+00:00',
            updatedAt: '2026-09-17T07:45:34.829269+00:00',
          },
        ],
      })
    })

    it('orders details by line_no ASC, id ASC and scopes to tenant, company, and parent item', async () => {
      const client = makeDetailsClient([parentRow], [
        makeDetailRow({ id: 'c1010000-0000-4000-8000-000000000031', line_no: 1, amount_text: '40.0000' }),
        makeDetailRow({ id: 'c1010000-0000-4000-8000-000000000032', line_no: 2, amount_text: '60.0000' }),
      ])
      const repository = new ProjectCostRepository(client as never)

      await repository.itemDetails(context([]).tenantId, context([]).companyId, parentRow.id)

      expect(client.from).toHaveBeenCalledWith('project_cost_item_details')
      expect(client.parentQuery.eq).toHaveBeenCalledWith('publication_state', 'published')
      expect(client.detailsQuery.eq).toHaveBeenCalledWith('tenant_id', context([]).tenantId)
      expect(client.detailsQuery.eq).toHaveBeenCalledWith('company_id', context([]).companyId)
      expect(client.detailsQuery.eq).toHaveBeenCalledWith('project_cost_item_id', parentRow.id)
      expect(client.detailsQuery.eq).toHaveBeenCalledWith('publication_state', 'published')
      expect(client.detailsQuery.order).toHaveBeenCalledWith('line_no')
    })

    it('returns 404 RESOURCE_NOT_FOUND if parent item is not found or in different company', async () => {
      const client = makeDetailsClient([], [])
      const repository = new ProjectCostRepository(client as never)

      await expect(repository.itemDetails(context([]).tenantId, context([]).companyId, parentRow.id)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      })
    })

    it('parses opening_balance detail correctly with null quantity, unit price, reference', async () => {
      const openingRow = makeDetailRow({
        detail_kind: 'opening_balance',
        quantity_text: null,
        unit_code: null,
        unit_price_text: null,
        relevant_date: null,
        reference: null,
        note: null,
      })
      const client = makeDetailsClient([parentRow], [openingRow])
      const repository = new ProjectCostRepository(client as never)

      const result = await repository.itemDetails(context([]).tenantId, context([]).companyId, parentRow.id)
      expect(result.details[0]).toMatchObject({
        detailKind: 'opening_balance',
        quantity: null,
        unitCode: null,
        unitPrice: null,
        relevantDate: null,
        reference: null,
        note: null,
      })
    })

    it('accepts PostgreSQL timestamptz with +00:00 offsets on detail rows', async () => {
      const row = makeDetailRow({
        created_at: '2026-09-17T07:45:34.829269+00:00',
        updated_at: '2026-09-17T07:45:34.829269+00:00',
      })
      const client = makeDetailsClient([parentRow], [row])
      const repository = new ProjectCostRepository(client as never)

      const result = await repository.itemDetails(context([]).tenantId, context([]).companyId, parentRow.id)
      expect(result.details[0]!.createdAt).toBe('2026-09-17T07:45:34.829269+00:00')
    })

    it('rejects a nonzero parent with no published detail rows', async () => {
      const client = makeDetailsClient([parentRow], [])
      const repository = new ProjectCostRepository(client as never)

      await expect(repository.itemDetails(context([]).tenantId, context([]).companyId, parentRow.id)).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
      })
    })

    it('rejects with 500 INTERNAL_ERROR when sum of details does not equal parent amount', async () => {
      const mismatchedRow = makeDetailRow({ amount_text: '95.0000' })
      const client = makeDetailsClient([parentRow], [mismatchedRow])
      const repository = new ProjectCostRepository(client as never)

      await expect(repository.itemDetails(context([]).tenantId, context([]).companyId, parentRow.id)).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
      })
    })

    it('selects and maps the three DB retention columns to camelCase retentionKind, retentionRateBps, retentionAmount', async () => {
      const row = makeDetailRow({
        retention_kind: 'warranty',
        retention_rate_bps: 500,
        retention_amount_text: '5.0000',
      })
      const client = makeDetailsClient([parentRow], [row])
      const repository = new ProjectCostRepository(client as never)

      const result = await repository.itemDetails(context([]).tenantId, context([]).companyId, parentRow.id)
      expect(client.detailsQuery.select).toHaveBeenCalledWith(
        'id,tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,quantity_text,unit_code,unit_price_text,amount_text,retention_kind,retention_rate_bps,retention_amount_text,relevant_date,reference,note,version,created_by,created_at,updated_at',
      )
      expect(result.details[0]!.retentionKind).toBe('warranty')
      expect(result.details[0]!.retentionRateBps).toBe(500)
      expect(result.details[0]!.retentionAmount).toBe('5.0000')
    })

    it('preserves SUM(detail.amount) == parent.amount invariant regardless of retentionAmount', async () => {
      // Recognized cost is 100.0000; warranty retention is 5.0000.
      // Invariant must check SUM(detail.amount) == parent.amount (100 == 100).
      // Retention must NOT be subtracted from the invariant.
      const rowWithRetention = makeDetailRow({
        amount_text: '100.0000',
        retention_kind: 'warranty',
        retention_rate_bps: 500,
        retention_amount_text: '5.0000',
      })
      const client = makeDetailsClient([parentRow], [rowWithRetention])
      const repository = new ProjectCostRepository(client as never)

      const result = await repository.itemDetails(context([]).tenantId, context([]).companyId, parentRow.id)
      expect(result.totalAmount).toBe('100.0000')
      expect(result.details[0]!.amount).toBe('100.0000')
      expect(result.details[0]!.retentionAmount).toBe('5.0000')

      // If parent amount erroneously expected amountAfterRetention (95.0000), it would throw INTERNAL_ERROR
      const parentErroneouslySubtracted = { ...parentRow, amount_text: '95.0000' }
      const clientBadParent = makeDetailsClient([parentErroneouslySubtracted], [rowWithRetention])
      const repositoryBadParent = new ProjectCostRepository(clientBadParent as never)
      await expect(repositoryBadParent.itemDetails(context([]).tenantId, context([]).companyId, parentRow.id)).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
      })
    })
  })
})
