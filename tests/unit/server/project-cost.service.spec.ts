import { describe, expect, it, vi } from 'vitest'
import { AppApiError } from '../../../server/utils/api-error'
import { ProjectCostRepository } from '../../../server/features/costs/project-cost.repository'
import { ProjectCostService } from '../../../server/features/costs/project-cost.service'

const context = (permissions: string[]) => ({ actorId: 'c1010000-0000-4000-8000-000000000902', tenantId: 'c1010000-0000-4000-8000-000000000010', companyId: 'c1010000-0000-4000-8000-000000000020', permissions, requestId: 'c1010000-0000-4000-8000-000000000999' })
const createInput = { projectId: 'c1010000-0000-4000-8000-000000000101', description: 'Synthetic', amount: '1.00', currencyCode: 'VND', workStatus: 'unknown' as const, nonOverlapConfirmationReference: 'confirmed' }
const itemRow = (overrides: Record<string, unknown> = {}) => ({ id: 'c1010000-0000-4000-8000-000000000001', tenant_id: 'c1010000-0000-4000-8000-000000000010', company_id: 'c1010000-0000-4000-8000-000000000020', project_id: 'c1010000-0000-4000-8000-000000000101', description: 'Synthetic', amount_text: '1.0000', currency_code: 'VND', work_status: 'unknown', business_reference: null, party_id: null, engagement_id: null, component_id: null, relevant_date: null, version: 0, created_by: 'c1010000-0000-4000-8000-000000000902', created_at: '2026-09-16T00:00:00.000Z', updated_at: '2026-09-16T00:00:00.000Z', ...overrides })
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
  it('maps a snake_case database row to the public project cost item without losing decimal text', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: [metadata('c1010000-0000-4000-8000-000000000101')], error: null }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ id: 'c1010000-0000-4000-8000-000000000001', tenant_id: 'c1010000-0000-4000-8000-000000000010', company_id: 'c1010000-0000-4000-8000-000000000020', project_id: 'c1010000-0000-4000-8000-000000000101', description: 'Synthetic', amount_text: '9007199254740993.0000', currency_code: 'VND', work_status: 'accepted', business_reference: null, party_id: null, engagement_id: null, component_id: null, relevant_date: null, version: 2, created_by: 'c1010000-0000-4000-8000-000000000902', created_at: '2026-09-16T00:00:00.000Z', updated_at: '2026-09-16T00:00:00.000Z' }], error: null }) }),
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

  it('returns the RPC acknowledgement instead of the Supabase response envelope', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { id: 'c1010000-0000-4000-8000-000000000001', version: 0, replayed: false }, error: null }) }
    const repository = new ProjectCostRepository(client as never)

    await expect(repository.create(context(['cost.manage']), { projectId: 'c1010000-0000-4000-8000-000000000101', description: 'Synthetic', amount: '1.00', currencyCode: 'VND', workStatus: 'unknown', nonOverlapConfirmationReference: 'confirmed' }, 'c1010000-0000-4000-8000-000000000998')).resolves.toEqual({ id: 'c1010000-0000-4000-8000-000000000001', version: 0, replayed: false })
  })

  it('maps VERSION_CONFLICT from RPC to a 409 AppApiError', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'VERSION_CONFLICT', message: 'stale version' } }) }
    const repository = new ProjectCostRepository(client as never)

    await expect(repository.create(context(['cost.manage']), { projectId: 'c1010000-0000-4000-8000-000000000101', description: 'Synthetic', amount: '1.00', currencyCode: 'VND', workStatus: 'unknown', nonOverlapConfirmationReference: 'confirmed' }, 'c1010000-0000-4000-8000-000000000998')).rejects.toBeInstanceOf(AppApiError)
    await expect(repository.create(context(['cost.manage']), { projectId: 'c1010000-0000-4000-8000-000000000101', description: 'Synthetic', amount: '1.00', currencyCode: 'VND', workStatus: 'unknown', nonOverlapConfirmationReference: 'confirmed' }, 'c1010000-0000-4000-8000-000000000998')).rejects.toMatchObject({ statusCode: 409, code: 'VERSION_CONFLICT' })
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
  })

  it('aggregates accepted and in-progress values, excludes unknown from total, and counts zero values', async () => {
    const client = listClient([
      itemRow({ id: 'c1010000-0000-4000-8000-000000000011', amount_text: '0.0000', work_status: 'accepted' }),
      itemRow({ id: 'c1010000-0000-4000-8000-000000000012', amount_text: '2.5000', work_status: 'in_progress' }),
      itemRow({ id: 'c1010000-0000-4000-8000-000000000013', amount_text: '7.0000', work_status: 'unknown' }),
    ])
    const repository = new ProjectCostRepository(client as never)

    await expect(repository.listSummaries(context([]).tenantId, context([]).companyId)).resolves.toEqual([{ ...metadata(createInput.projectId), summary: { acceptedValue: '0.0000', acceptedCount: 1, inProgressValue: '2.5000', inProgressCount: 1, unknownStatusValue: '7.0000', unknownCount: 1, totalTrackedWorkValue: '2.5000' } }])
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
      { ...metadata(createInput.projectId), summary: { acceptedValue: '100.0000', acceptedCount: 1, inProgressValue: '50.0000', inProgressCount: 1, unknownStatusValue: '20.0000', unknownCount: 1, totalTrackedWorkValue: '150.0000' } },
      { ...metadata(projectB), summary: { acceptedValue: '10.0000', acceptedCount: 1, inProgressValue: '5.0000', inProgressCount: 1, unknownStatusValue: '2.0000', unknownCount: 1, totalTrackedWorkValue: '15.0000' } },
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

  it('preserves MODULE_DISABLED as the reason for direct RPC errors', async () => {
    const repository = new ProjectCostRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: 'MODULE_DISABLED' } }) } as never)

    await expect(repository.create(context(['cost.manage']), createInput, 'c1010000-0000-4000-8000-000000000998')).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED', details: { reason: 'MODULE_DISABLED' } })
  })

  it.each([
    ['MODULE_DISABLED', 403, 'PERMISSION_DENIED'], ['PERMISSION_DENIED', 403, 'PERMISSION_DENIED'], ['RESOURCE_NOT_FOUND', 404, 'RESOURCE_NOT_FOUND'], ['IDEMPOTENCY_CONFLICT', 409, 'IDEMPOTENCY_CONFLICT'], ['INPUT_INVALID', 400, 'INPUT_INVALID'], ['unexpected database error', 500, 'INTERNAL_ERROR'],
  ])('maps RPC %s to the public API error', async (code, statusCode, expectedCode) => {
    const repository = new ProjectCostRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: code } }) } as never)

    await expect(repository.create(context(['cost.manage']), createInput, 'c1010000-0000-4000-8000-000000000998')).rejects.toMatchObject({ statusCode, code: expectedCode })
  })

  it('returns update and correction acknowledgements without a post-write table read', async () => {
    const client = { from: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: { id: 'c1010000-0000-4000-8000-000000000001', version: 3 }, error: null }) }
    const repository = new ProjectCostRepository(client as never)

    await expect(repository.update(context(['cost.manage']), 'c1010000-0000-4000-8000-000000000001', { kind: 'update', input: { description: 'Renamed', expectedVersion: 2 } })).resolves.toEqual({ id: 'c1010000-0000-4000-8000-000000000001', version: 3 })
    await expect(repository.update(context(['cost.correct']), 'c1010000-0000-4000-8000-000000000001', { kind: 'correction', input: { amount: '2.00', reason: 'Correction', expectedVersion: 2 } })).resolves.toEqual({ id: 'c1010000-0000-4000-8000-000000000001', version: 3 })
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'c1_update_project_cost_item', expect.any(Object))
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'c1_correct_project_cost_item', expect.any(Object))
    expect(client.from).not.toHaveBeenCalled()
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

  it('allows cost.manage create without cost.read and preserves idempotency input', async () => {
    const repository = { create: vi.fn().mockResolvedValue({ id: 'c1010000-0000-4000-8000-000000000001', version: 0, replayed: false }) }
    const service = new ProjectCostService(repository as never)
    await expect(service.create(context(['cost.manage']), { projectId: 'c1010000-0000-4000-8000-000000000101', description: 'Synthetic', amount: '9007199254740993.0000', currencyCode: 'VND', workStatus: 'unknown', nonOverlapConfirmationReference: 'confirmed' }, 'c1010000-0000-4000-8000-000000000998')).resolves.toMatchObject({ replayed: false })
    expect(repository.create).toHaveBeenCalledOnce()
  })

  it('passes valid source figure provenance IDs unchanged to the guarded create repository', async () => {
    const repository = { create: vi.fn().mockResolvedValue({ id: 'c1010000-0000-4000-8000-000000000001', version: 0, replayed: false }) }
    const service = new ProjectCostService(repository as never)
    const input = { ...createInput, sourceFigureIds: ['c1010000-0000-4000-8000-000000000604', 'c1010000-0000-4000-8000-000000000605'] }

    await service.create(context(['cost.manage']), input, 'c1010000-0000-4000-8000-000000000998')
    expect(repository.create).toHaveBeenCalledWith(context(['cost.manage']), input, 'c1010000-0000-4000-8000-000000000998')
  })

  it('rejects duplicate source figure provenance IDs before repository invocation', async () => {
    const repository = { create: vi.fn() }
    const service = new ProjectCostService(repository as never)
    const sourceFigureId = 'c1010000-0000-4000-8000-000000000604'

    await expect(service.create(context(['cost.manage']), { ...createInput, sourceFigureIds: [sourceFigureId, sourceFigureId] }, 'c1010000-0000-4000-8000-000000000998')).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('requires cost.manage for ordinary updates and cost.correct for corrections', async () => {
    const repository = { update: vi.fn().mockResolvedValue({ id: 'c1010000-0000-4000-8000-000000000001', version: 1 }) }
    const service = new ProjectCostService(repository as never)

    await expect(service.update(context(['cost.manage']), 'c1010000-0000-4000-8000-000000000001', { description: 'Renamed', expectedVersion: 0 })).resolves.toEqual(expect.any(Object))
    await expect(service.correct(context(['cost.correct']), 'c1010000-0000-4000-8000-000000000001', { amount: '2.00', reason: 'Correction', expectedVersion: 0 })).resolves.toEqual(expect.any(Object))
    await expect(service.correct(context(['cost.manage']), 'c1010000-0000-4000-8000-000000000001', { amount: '2.00', reason: 'Correction', expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    await expect(service.update(context(['cost.correct']), 'c1010000-0000-4000-8000-000000000001', { description: 'Renamed', expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(repository.update).toHaveBeenCalledTimes(2)
  })

  it('maps invalid Zod input to INPUT_INVALID before calling the repository', async () => {
    const repository = { create: vi.fn() }
    const service = new ProjectCostService(repository as never)

    await expect(service.create(context(['cost.manage']), { ...createInput, amount: 'not-a-decimal' }, 'c1010000-0000-4000-8000-000000000998')).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(repository.create).not.toHaveBeenCalled()
  })
})
