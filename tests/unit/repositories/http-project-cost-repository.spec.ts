import { describe, expect, it, vi } from 'vitest'
import { createHttpProjectCostRepository } from '../../../app/repositories/http/http-project-cost-repository'

const ids = { company: 'c1010000-0000-4000-8000-000000000020', project: 'c1010000-0000-4000-8000-000000000101', item: 'c1010000-0000-4000-8000-000000000001', key: 'c1010000-0000-4000-8000-000000000998', sourceFigure1: 'c1010000-0000-4000-8000-000000000604', sourceFigure2: 'c1010000-0000-4000-8000-000000000605' }
const summary = { currencyCode: 'VND', acceptedValue: '0.0000', acceptedCount: 0, inProgressValue: '0.0000', inProgressCount: 0, unknownStatusValue: '0.0000', unknownCount: 0, totalTrackedWorkValue: '0.0000' }
const item = { id: ids.item, tenantId: 'c1010000-0000-4000-8000-000000000010', companyId: ids.company, projectId: ids.project, description: 'Synthetic', amount: '1.0000', currencyCode: 'VND', workStatus: 'unknown', businessReference: null, partyId: null, engagementId: null, componentId: null, relevantDate: null, version: 0, createdAt: '2026-09-16T00:00:00.000Z', updatedAt: '2026-09-16T00:00:00.000Z' }
const metadata = { projectId: ids.project, projectCode: 'C101-P1', projectName: 'C101 project one' }
const breakdown = { ...metadata, summary, items: [item] }
const draft = { description: 'Synthetic', amount: '1.0000', currencyCode: 'VND', workStatus: 'unknown', nonOverlapConfirmationReference: 'confirmed' }
const responseClient = (response: unknown) => ({ request: vi.fn().mockImplementation(async input => input.schema.parse(response)) })

describe('HTTP Project Cost repository', () => {
  it('gets strict company summaries from the current encoded company URL', async () => {
    const companyId = vi.fn().mockReturnValue('company/id')
    const client = responseClient([{ ...metadata, summary }])
    const repository = createHttpProjectCostRepository({ companyId, client: client as never })

    await expect(repository.summaries()).resolves.toEqual([{ ...metadata, summary }])
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/companies/company%2Fid/project-costs', method: 'GET' }))
    expect(companyId).toHaveBeenCalledOnce()
  })

  it('gets project detail through encoded current-company and project paths', async () => {
    const client = responseClient(breakdown)
    const repository = createHttpProjectCostRepository({ companyId: 'company/id', client: client as never })

    await expect(repository.project('project/id')).resolves.toEqual(breakdown)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/companies/company%2Fid/projects/project%2Fid/project-costs', method: 'GET' }))
  })

  it('binds the create body to its project path and generates exactly one idempotency UUID', async () => {
    const createIdempotencyKey = vi.fn().mockReturnValue(ids.key)
    const client = responseClient({ id: ids.item, version: 0, replayed: false })
    const repository = createHttpProjectCostRepository({ companyId: ids.company, client: client as never, createIdempotencyKey })

    await expect(repository.create(ids.project, draft)).resolves.toEqual({ id: ids.item, version: 0, replayed: false })
    expect(createIdempotencyKey).toHaveBeenCalledOnce()
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ url: `/api/companies/${ids.company}/projects/${ids.project}/project-costs`, method: 'POST', body: { ...draft, projectId: ids.project }, idempotencyKey: ids.key }))
  })

  it('sends source figure provenance IDs unchanged in the guarded create body', async () => {
    const createIdempotencyKey = vi.fn().mockReturnValue(ids.key)
    const client = responseClient({ id: ids.item, version: 0, replayed: false })
    const repository = createHttpProjectCostRepository({ companyId: ids.company, client: client as never, createIdempotencyKey })
    const input = { ...draft, sourceFigureIds: [ids.sourceFigure1, ids.sourceFigure2] }

    await repository.create(ids.project, input)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', body: { ...input, projectId: ids.project } }))
  })

  it('sends ordinary update bodies unchanged without caller discriminators', async () => {
    const input = { description: 'Renamed', workStatus: 'in_progress', expectedVersion: 2 }
    const client = responseClient({ id: ids.item, version: 3 })
    const repository = createHttpProjectCostRepository({ companyId: 'company/id', client: client as never })

    await expect(repository.update('item/id', input)).resolves.toEqual({ id: ids.item, version: 3 })
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/companies/company%2Fid/project-costs/item%2Fid', method: 'PATCH', body: input }))
    expect(client.request.mock.calls[0][0].body).not.toHaveProperty('kind')
    expect(client.request.mock.calls[0][0].body).not.toHaveProperty('mode')
  })

  it('sends correction bodies unchanged without a caller discriminator', async () => {
    const input = { amount: '2.0000', reason: 'Correction', expectedVersion: 2 }
    const client = responseClient({ id: ids.item, version: 3 })
    const repository = createHttpProjectCostRepository({ companyId: ids.company, client: client as never })

    await expect(repository.update(ids.item, input)).resolves.toEqual({ id: ids.item, version: 3 })
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'PATCH', body: input }))
    expect(client.request.mock.calls[0][0].body).not.toHaveProperty('kind')
    expect(client.request.mock.calls[0][0].body).not.toHaveProperty('mode')
  })

  it('rejects an invalid patch body before requesting HTTP', async () => {
    const client = responseClient({ id: ids.item, version: 3 })
    const repository = createHttpProjectCostRepository({ companyId: ids.company, client: client as never })

    expect(() => repository.update(ids.item, { expectedVersion: 2 } as never)).toThrow()
    expect(client.request).not.toHaveBeenCalled()
  })

  it.each(['sourceReportedFigureId', 'sourceFigureIds', 'workbook', 'sheet', 'locator', 'paidAmount', 'invoice', 'reconciliation'])('rejects extra normal response field %s', async field => {
    const client = responseClient([{ projectId: ids.project, summary, [field]: 'forbidden' }])
    const repository = createHttpProjectCostRepository({ companyId: ids.company, client: client as never })

    await expect(repository.summaries()).rejects.toThrow()
  })

  it('rejects source mechanics in a project breakdown response', async () => {
    const client = responseClient({ ...breakdown, items: [{ ...item, locator: 'forbidden' }] })
    const repository = createHttpProjectCostRepository({ companyId: ids.company, client: client as never })

    await expect(repository.project(ids.project)).rejects.toThrow()
  })

  it.each(['projectCode', 'projectName'])('rejects a Project Cost response missing required metadata %s', async field => {
    const response = field === 'projectCode'
      ? { projectId: ids.project, projectName: metadata.projectName, summary }
      : { projectId: ids.project, projectCode: metadata.projectCode, summary }
    const client = responseClient([response])

    await expect(createHttpProjectCostRepository({ companyId: ids.company, client: client as never }).summaries()).rejects.toThrow()
  })

  it('rejects unexpected Project metadata fields', async () => {
    const client = responseClient([{ ...metadata, summary, operationalState: 'active' }])

    await expect(createHttpProjectCostRepository({ companyId: ids.company, client: client as never }).summaries()).rejects.toThrow()
  })

  it.each([
    { acceptedValue: summary.acceptedValue, acceptedCount: summary.acceptedCount, inProgressValue: summary.inProgressValue, inProgressCount: summary.inProgressCount, unknownStatusValue: summary.unknownStatusValue, unknownCount: summary.unknownCount, totalTrackedWorkValue: summary.totalTrackedWorkValue },
    { ...summary, currencyCode: 'VN' },
  ])('rejects invalid summary currency %o', async invalidSummary => {
    const client = responseClient([{ ...metadata, summary: invalidSummary }])
    await expect(createHttpProjectCostRepository({ companyId: ids.company, client: client as never }).summaries()).rejects.toThrow()
  })

  it('rejects extra fields in create and mutation acknowledgements', async () => {
    const createClient = responseClient({ id: ids.item, version: 0, replayed: false, workbook: 'forbidden' })
    const mutationClient = responseClient({ id: ids.item, version: 3, sheet: 'forbidden' })

    await expect(createHttpProjectCostRepository({ companyId: ids.company, client: createClient as never, createIdempotencyKey: () => ids.key }).create(ids.project, draft)).rejects.toThrow()
    await expect(createHttpProjectCostRepository({ companyId: ids.company, client: mutationClient as never }).update(ids.item, { description: 'Renamed', expectedVersion: 2 })).rejects.toThrow()
  })
})
