import { describe, expect, it, vi } from 'vitest'
import { AppApiError } from '../../../server/utils/api-error'
import { ProjectCostRepository } from '../../../server/features/costs/project-cost.repository'
import { ProjectCostService } from '../../../server/features/costs/project-cost.service'

const context = (permissions: string[]) => ({ actorId: 'c1010000-0000-4000-8000-000000000902', tenantId: 'c1010000-0000-4000-8000-000000000010', companyId: 'c1010000-0000-4000-8000-000000000020', permissions, requestId: 'c1010000-0000-4000-8000-000000000999' })
const createInput = { projectId: 'c1010000-0000-4000-8000-000000000101', description: 'Synthetic', amount: '1.00', currencyCode: 'VND', workStatus: 'unknown' as const, nonOverlapConfirmationReference: 'confirmed' }
const createDraftInput = { projectId: createInput.projectId, description: 'Synthetic draft', costCategoryId: 'c1010000-0000-4000-8000-000000000301', workStatus: 'unknown' as const }
const financialInput = { expectedVersion: 0, currencyCode: 'VND', details: [{ lineNo: 1, detailKind: 'line_item' as const, description: 'Zero', amount: '0.0000' }], sourceFigureIds: [] }
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

  it.each(['cost.manage', 'cost.prepare', 'cost.correct', 'cost.record_cash'] as const)('does not let %s substitute for cost.publish_import', async permission => {
    const repository = { publish: vi.fn() }
    await expect(new ProjectCostService(repository as never).publish(context([permission]), itemRow().id, { expectedVersion: 1 }, context([]).requestId)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(repository.publish).not.toHaveBeenCalled()
  })

  it('publishes only with cost.publish_import', async () => {
    const repository = { publish: vi.fn().mockResolvedValue({ id: itemRow().id, version: 2, publicationState: 'published', replayed: false }) }
    await new ProjectCostService(repository as never).publish(context(['cost.publish_import']), itemRow().id, { expectedVersion: 1 }, context([]).requestId)
    expect(repository.publish).toHaveBeenCalledWith(expect.objectContaining({ companyId: context([]).companyId }), itemRow().id, 1, context([]).requestId)
  })

  it.each(['cost.prepare', 'cost.publish_import', 'cost.correct', 'cost.record_cash'] as const)('does not let %s substitute for cost.manage', async permission => {
    const repository = { createDraft: vi.fn() }
    await expect(new ProjectCostService(repository as never).createDraft(context([permission]), createDraftInput, context([]).requestId)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(repository.createDraft).not.toHaveBeenCalled()
  })

  it.each(['cost.manage', 'cost.publish_import', 'cost.correct', 'cost.record_cash'] as const)('does not let %s substitute for cost.prepare', async permission => {
    const repository = { prepareFinancials: vi.fn() }
    await expect(new ProjectCostService(repository as never).prepareFinancials(context([permission]), itemRow().id, financialInput)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(repository.prepareFinancials).not.toHaveBeenCalled()
  })

  it('owns draft identity with cost.manage and financial preparation with cost.prepare', async () => {
    const repository = { createDraft: vi.fn().mockResolvedValue({ id: itemRow().id }), prepareFinancials: vi.fn().mockResolvedValue({ id: itemRow().id }) }
    const service = new ProjectCostService(repository as never)
    await service.createDraft(context(['cost.manage']), createDraftInput, context([]).requestId)
    await service.prepareFinancials(context(['cost.prepare']), itemRow().id, financialInput)
    expect(repository.createDraft).toHaveBeenCalledOnce()
    expect(repository.prepareFinancials).toHaveBeenCalledOnce()
  })

  it('maps the five P2 repository operations to their exact RPCs', async () => {
    const draft = {
      id: itemRow().id, projectId: createDraftInput.projectId, description: createDraftInput.description, costCategoryId: createDraftInput.costCategoryId,
      businessReference: null, partyId: null, engagementId: null, componentId: null, relevantDate: null, workStatus: 'unknown', amount: null,
      currencyCode: 'VND', publicationState: 'draft', version: 0, details: [], sourceFigureIds: [],
      publishReadiness: { ready: false, blockingCodes: ['FINANCIAL_DETAILS_REQUIRED'] }, createdAt: itemRow().created_at, updatedAt: itemRow().updated_at,
    }
    const rpc = vi.fn().mockImplementation(async (name: string) => ({
      data: name === 'c1_prepare_project_cost_financials'
        ? { id: draft.id, version: 1, publicationState: 'draft', amount: '0', detailCount: 1, publishReadiness: { ready: true, blockingCodes: [] }, replayed: false }
        : name === 'c1_read_project_cost_draft' ? draft
          : name === 'c1_list_project_cost_drafts' ? [draft]
            : { id: draft.id, version: name === 'c1_update_project_cost_draft' ? 1 : 0, publicationState: 'draft', replayed: false },
      error: null,
    }))
    const repository = new ProjectCostRepository({ rpc } as never)
    const requestContext = { companyId: context([]).companyId, requestId: context([]).requestId }

    await repository.createDraft(requestContext, createDraftInput, context([]).requestId)
    await repository.updateDraft(requestContext, draft.id, { expectedVersion: 0, description: 'Updated' })
    await repository.prepareFinancials(requestContext, draft.id, financialInput)
    await repository.draft(requestContext, draft.id)
    await repository.listDrafts(requestContext, draft.projectId)

    expect(rpc.mock.calls.map(call => call[0])).toEqual(['c1_create_project_cost_draft', 'c1_update_project_cost_draft', 'c1_prepare_project_cost_financials', 'c1_read_project_cost_draft', 'c1_list_project_cost_drafts'])
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
                  order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ id: 'c1010000-0000-4000-8000-000000000001', tenant_id: 'c1010000-0000-4000-8000-000000000010', company_id: 'c1010000-0000-4000-8000-000000000020', project_id: 'c1010000-0000-4000-8000-000000000101', description: 'Synthetic', amount_text: '9007199254740993.0000', currency_code: 'VND', work_status: 'accepted', business_reference: null, party_id: null, engagement_id: null, component_id: null, relevant_date: null, version: 2, created_by: 'c1010000-0000-4000-8000-000000000902', created_at: '2026-09-16T00:00:00.000Z', updated_at: '2026-09-16T00:00:00.000Z' }], error: null }) }),
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

    it('returns empty details array when item has no detail rows without failing invariant', async () => {
      const client = makeDetailsClient([parentRow], [])
      const repository = new ProjectCostRepository(client as never)

      const result = await repository.itemDetails(context([]).tenantId, context([]).companyId, parentRow.id)
      expect(result).toEqual({
        projectCostItemId: parentRow.id,
        totalAmount: '100.0000',
        currencyCode: 'VND',
        details: [],
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
