import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectCostRoutes } from '../../../server/features/costs/project-cost.routes'

const { getHeader, getRouterParam, readBody } = vi.hoisted(() => ({ getHeader: vi.fn(), getRouterParam: vi.fn(), readBody: vi.fn() }))
vi.mock('h3', async importOriginal => ({ ...await importOriginal<typeof import('h3')>(), getHeader, getRouterParam, readBody }))

const ids = { companyId: 'c1010000-0000-4000-8000-000000000020', projectId: 'c1010000-0000-4000-8000-000000000101', itemId: 'c1010000-0000-4000-8000-000000000001', actorId: 'c1010000-0000-4000-8000-000000000902', tenantId: 'c1010000-0000-4000-8000-000000000010', requestId: 'c1010000-0000-4000-8000-000000000999', idempotencyKey: 'c1010000-0000-4000-8000-000000000998', sourceFigure1: 'c1010000-0000-4000-8000-000000000604', sourceFigure2: 'c1010000-0000-4000-8000-000000000605' }
const trustedContext = { actorId: ids.actorId, tenantId: ids.tenantId, companyId: ids.companyId, permissions: ['cost.read', 'cost.manage', 'cost.correct'], requestId: ids.requestId }
const createInput = { projectId: ids.projectId, description: 'Synthetic draft', costCategoryId: 'c1010000-0000-4000-8000-000000000301', workStatus: 'unknown' }
const financialInput = { expectedVersion: 0, currencyCode: 'VND', details: [{ lineNo: 1, detailKind: 'line_item', description: 'Zero', amount: '0.0000' }], sourceFigureIds: [] }

function route(service: Record<string, ReturnType<typeof vi.fn>>) {
  const resolveContext = vi.fn().mockResolvedValue(trustedContext)
  return { routes: createProjectCostRoutes({ resolveContext, service: service as never }), resolveContext }
}

describe('Project Cost routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRouterParam.mockImplementation((_event, name) => ({ companyId: ids.companyId, projectId: ids.projectId, projectCostItemId: ids.itemId }[name]))
    getHeader.mockReturnValue(ids.idempotencyKey)
  })

  it('resolves trusted company context before requesting company summaries', async () => {
    const service = { listSummaries: vi.fn().mockResolvedValue([]) }
    const value = route(service)

    await expect(value.routes.summaries({} as never)).resolves.toEqual([])
    expect(value.resolveContext).toHaveBeenCalledWith(expect.anything(), ids.companyId)
    expect(service.listSummaries).toHaveBeenCalledWith(trustedContext)
  })

  it('routes financial preparation without an idempotency header', async () => {
    readBody.mockResolvedValue(financialInput)
    getHeader.mockReturnValue(undefined)
    const service = { prepareFinancials: vi.fn().mockResolvedValue({ id: ids.itemId }) }

    await route(service).routes.financials({} as never)

    expect(service.prepareFinancials).toHaveBeenCalledWith(trustedContext, ids.itemId, expect.objectContaining({ ...financialInput, details: [expect.objectContaining(financialInput.details[0]!)] }))
  })

  it('routes draft detail and project draft list reads', async () => {
    const service = { draft: vi.fn().mockResolvedValue({ id: ids.itemId }), listDrafts: vi.fn().mockResolvedValue([]) }
    const routes = route(service).routes
    await routes.draft({} as never)
    await routes.drafts({} as never)
    expect(service.draft).toHaveBeenCalledWith(trustedContext, ids.itemId)
    expect(service.listDrafts).toHaveBeenCalledWith(trustedContext, ids.projectId)
  })

  it('requires expectedVersion and a UUID idempotency key for publish', async () => {
    readBody.mockResolvedValue({ expectedVersion: 1 })
    const service = { publish: vi.fn().mockResolvedValue({ id: ids.itemId, version: 2, publicationState: 'published', replayed: false }) }
    await route(service).routes.publish({} as never)
    expect(service.publish).toHaveBeenCalledWith(trustedContext, ids.itemId, { expectedVersion: 1 }, ids.idempotencyKey)
    getHeader.mockReturnValue(undefined)
    await expect(route(service).routes.publish({} as never)).rejects.toMatchObject({ code: 'INPUT_INVALID' })
    expect(service.publish).toHaveBeenCalledOnce()
  })

  it('accepts correction only on the explicit idempotent corrections route', async () => {
    const input = { expectedVersion: 2, reason: 'Correct source', operationalChanges: { workStatus: 'accepted' } }
    readBody.mockResolvedValue(input)
    const service = { correctPublished: vi.fn().mockResolvedValue({ id: ids.itemId, version: 3, publicationState: 'published', replayed: false }) }
    await route(service).routes.correction({} as never)
    expect(service.correctPublished).toHaveBeenCalledWith(trustedContext, ids.itemId, input, ids.idempotencyKey)
  })

  it('rejects a malformed company id before resolving trusted context', async () => {
    getRouterParam.mockImplementation((_event, name) => name === 'companyId' ? 'not-a-uuid' : ids.projectId)
    const service = { listSummaries: vi.fn() }
    const value = route(service)

    await expect(value.routes.summaries({} as never)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(value.resolveContext).not.toHaveBeenCalled()
    expect(service.listSummaries).not.toHaveBeenCalled()
  })

  it('validates a project id before invoking project breakdown service', async () => {
    const service = { projectSummary: vi.fn().mockResolvedValue({}) }
    const value = route(service)

    await value.routes.project({} as never)
    expect(service.projectSummary).toHaveBeenCalledWith(trustedContext, ids.projectId)

    getRouterParam.mockImplementation((_event, name) => name === 'projectId' ? 'not-a-uuid' : ids.companyId)
    await expect(value.routes.project({} as never)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(service.projectSummary).toHaveBeenCalledOnce()
  })

  it('creates only when path project, strict body, and UUID idempotency key are valid', async () => {
    readBody.mockResolvedValue(createInput)
    const service = { createDraft: vi.fn().mockResolvedValue({ id: ids.itemId, version: 0, publicationState: 'draft', replayed: false }) }
    const value = route(service)

    await expect(value.routes.create({} as never)).resolves.toMatchObject({ id: ids.itemId })
    expect(service.createDraft).toHaveBeenCalledWith(trustedContext, createInput, ids.idempotencyKey)
  })

  it('rejects source provenance from cost.manage create', async () => {
    const input = { ...createInput, sourceFigureIds: [ids.sourceFigure1, ids.sourceFigure2] }
    readBody.mockResolvedValue(input)
    const service = { createDraft: vi.fn() }

    await expect(route(service).routes.create({} as never)).rejects.toMatchObject({ code: 'INPUT_INVALID' })
    expect(service.createDraft).not.toHaveBeenCalled()
  })

  it.each([{ sourceFigureIds: [] }, { sourceFigureIds: [ids.sourceFigure1, ids.sourceFigure1] }])('rejects invalid source figure provenance arrays without creating', ({ sourceFigureIds }) => {
    readBody.mockResolvedValue({ ...createInput, sourceFigureIds })
    const service = { createDraft: vi.fn() }

    return expect(route(service).routes.create({} as never)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' }).then(() => expect(service.createDraft).not.toHaveBeenCalled())
  })

  it.each([undefined, 'not-a-uuid'])('rejects invalid idempotency key %s without creating', async key => {
    getHeader.mockReturnValue(key)
    readBody.mockResolvedValue(createInput)
    const service = { createDraft: vi.fn() }

    await expect(route(service).routes.create({} as never)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(service.createDraft).not.toHaveBeenCalled()
  })

  it('rejects a create body whose project differs from the route', async () => {
    readBody.mockResolvedValue({ ...createInput, projectId: 'c1010000-0000-4000-8000-000000000102' })
    const service = { createDraft: vi.fn() }

    await expect(route(service).routes.create({} as never)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(service.createDraft).not.toHaveBeenCalled()
  })

  it.each(['actorId', 'tenantId', 'companyId', 'permissions', 'requestId', 'kind', 'mode'])('rejects caller-owned create field %s', async field => {
    readBody.mockResolvedValue({ ...createInput, [field]: field === 'permissions' ? [] : 'forged' })
    const service = { createDraft: vi.fn() }

    await expect(route(service).routes.create({} as never)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(service.createDraft).not.toHaveBeenCalled()
  })

  it('routes an ordinary draft patch and reads its body once', async () => {
    readBody.mockResolvedValue({ description: 'Renamed', workStatus: 'in_progress', expectedVersion: 2 })
    const service = { updateDraft: vi.fn().mockResolvedValue({ id: ids.itemId, version: 3, publicationState: 'draft', replayed: false }) }
    const value = route(service)

    await value.routes.patch({} as never)
    expect(readBody).toHaveBeenCalledOnce()
    expect(service.updateDraft).toHaveBeenCalledWith(trustedContext, ids.itemId, { description: 'Renamed', workStatus: 'in_progress', expectedVersion: 2 })
  })

  it.each([
    { amount: '2.00', reason: 'Correction', expectedVersion: 2 },
    { workStatus: 'accepted', reason: 'Correction', expectedVersion: 2 },
  ])('rejects correction semantics from ordinary PATCH', async body => {
    readBody.mockResolvedValue(body)
    const service = { updateDraft: vi.fn() }

    await expect(route(service).routes.patch({} as never)).rejects.toMatchObject({ code: 'INPUT_INVALID' })
    expect(service.updateDraft).not.toHaveBeenCalled()
  })

  it.each([
    { kind: 'correction', amount: '2.00', reason: 'Correction', expectedVersion: 2 },
    { mode: 'correction', amount: '2.00', reason: 'Correction', expectedVersion: 2 },
    { description: 'Renamed', amount: '2.00', reason: 'Correction', expectedVersion: 2 },
  ])('rejects caller-controlled or malformed patch bodies', async body => {
    readBody.mockResolvedValue(body)
    const service = { updateDraft: vi.fn() }

    await expect(route(service).routes.patch({} as never)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(service.updateDraft).not.toHaveBeenCalled()
  })

  it.each(['actorId', 'tenantId', 'companyId', 'permissions', 'requestId'])('rejects caller-owned patch field %s', async field => {
    readBody.mockResolvedValue({ description: 'Renamed', expectedVersion: 2, [field]: field === 'permissions' ? [] : 'forged' })
    const service = { updateDraft: vi.fn() }

    await expect(route(service).routes.patch({} as never)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(service.updateDraft).not.toHaveBeenCalled()
  })

  it('rejects a malformed item id before reading or invoking the patch service', async () => {
    getRouterParam.mockImplementation((_event, name) => name === 'projectCostItemId' ? 'not-a-uuid' : ids.companyId)
    const service = { updateDraft: vi.fn() }

    await expect(route(service).routes.patch({} as never)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(readBody).not.toHaveBeenCalled()
    expect(service.updateDraft).not.toHaveBeenCalled()
  })
})
