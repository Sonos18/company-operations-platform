import { describe, expect, it, vi } from 'vitest'
import { createHttpProjectCostRepository } from '../../../app/repositories/http/http-project-cost-repository'

const ids = { company: 'c1010000-0000-4000-8000-000000000020', project: 'c1010000-0000-4000-8000-000000000101', item: 'c1010000-0000-4000-8000-000000000001', key: 'c1010000-0000-4000-8000-000000000998', sourceFigure1: 'c1010000-0000-4000-8000-000000000604', sourceFigure2: 'c1010000-0000-4000-8000-000000000605' }
const summary = { currencyCode: 'VND', acceptedValue: '0.0000', acceptedCount: 0, inProgressValue: '0.0000', inProgressCount: 0, unknownStatusValue: '0.0000', unknownCount: 0, totalTrackedWorkValue: '0.0000' }
const item = { id: ids.item, tenantId: 'c1010000-0000-4000-8000-000000000010', companyId: ids.company, projectId: ids.project, description: 'Synthetic', amount: '1.0000', currencyCode: 'VND', workStatus: 'unknown', businessReference: null, partyId: null, engagementId: null, componentId: null, relevantDate: null, version: 0, createdAt: '2026-09-16T00:00:00.000Z', updatedAt: '2026-09-16T00:00:00.000Z' }
const metadata = { projectId: ids.project, projectCode: 'C101-P1', projectName: 'C101 project one' }
const breakdown = { ...metadata, summary, items: [item] }
const draft = { description: 'Synthetic', costCategoryId: 'c1010000-0000-4000-8000-000000000301', workStatus: 'unknown' }
const responseClient = (response: unknown) => ({ request: vi.fn().mockImplementation(async input => input.schema.parse(response)) })

describe('HTTP Project Cost repository', () => {
  it('uses metadata and published correction endpoints after parent draft retirement', async () => {
    const metadataResponse = { projects: [{ id: ids.project, code: 'P1', name: 'Project one', operationalState: 'active' }], categories: [{ categoryId: draft.costCategoryId, code: 'vat_tu', name: 'Materials', isActive: true, draftEligible: true, postingStrategy: 'ordinary_detail' }] }
    const metadataClient = responseClient(metadataResponse)
    await expect(createHttpProjectCostRepository({ companyId: 'company/id', client: metadataClient as never }).draftManagementMetadata()).resolves.toEqual(metadataResponse)
    expect(metadataClient.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/companies/company%2Fid/project-cost-drafts/metadata', method: 'GET' }))

    const corrClient = responseClient({ id: ids.item, version: 3, publicationState: 'published', replayed: false })
    const corrRepo = createHttpProjectCostRepository({ companyId: 'company/id', client: corrClient as never })
    await corrRepo.correct('item/id', { expectedVersion: 2, reason: 'Audit correction', operationalChanges: { description: 'Updated description' } }, { idempotencyKey: ids.key })
    expect(corrClient.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/companies/company%2Fid/project-costs/item%2Fid/corrections', method: 'POST', body: expect.objectContaining({ expectedVersion: 2, reason: 'Audit correction' }), idempotencyKey: ids.key }))
  })

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

  it('gets project cost item details through encoded current-company and projectCostItem paths', async () => {
    const detailItem = {
      id: 'c1010000-0000-4000-8000-000000000002',
      projectCostItemId: ids.item,
      lineNo: 1,
      detailKind: 'line_item' as const,
      description: 'First detail line',
      quantity: '2.0000',
      unitCode: 'm2',
      unitPrice: '500.0000',
      amount: '1000.0000',
      retentionKind: null,
      retentionRateBps: null,
      retentionAmount: null,
      relevantDate: '2026-09-17',
      reference: 'REF-001',
      note: null,
      version: 0,
      createdAt: '2026-09-17T07:45:34.829269+00:00',
      updatedAt: '2026-09-17T07:45:34.829269+00:00',
    }
    const detailsResponse = {
      projectCostItemId: ids.item,
      totalAmount: '1000.0000',
      currencyCode: 'VND',
      details: [detailItem],
    }
    const client = responseClient(detailsResponse)
    const repository = createHttpProjectCostRepository({ companyId: 'company/id', client: client as never })

    await expect(repository.details('item/id')).resolves.toEqual(detailsResponse)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/companies/company%2Fid/project-costs/item%2Fid/details',
      method: 'GET',
    }))
  })

  it('gets project cost item details through encoded current-company and projectCostItem paths with structured warranty retention', async () => {
    const detailItem = {
      id: 'c1010000-0000-4000-8000-000000000002',
      projectCostItemId: ids.item,
      lineNo: 1,
      detailKind: 'line_item' as const,
      description: 'First detail line',
      quantity: '2.0000',
      unitCode: 'm2',
      unitPrice: '500.0000',
      amount: '1000.0000',
      retentionKind: 'warranty' as const,
      retentionRateBps: 500,
      retentionAmount: '50.0000',
      relevantDate: '2026-09-17',
      reference: 'REF-001',
      note: null,
      version: 0,
      createdAt: '2026-09-17T07:45:34.829269+00:00',
      updatedAt: '2026-09-17T07:45:34.829269+00:00',
    }
    const detailsResponse = {
      projectCostItemId: ids.item,
      totalAmount: '1000.0000',
      currencyCode: 'VND',
      details: [detailItem],
    }
    const client = responseClient(detailsResponse)
    const repository = createHttpProjectCostRepository({ companyId: 'company/id', client: client as never })

    await expect(repository.details('item/id')).resolves.toEqual(detailsResponse)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/companies/company%2Fid/project-costs/item%2Fid/details',
      method: 'GET',
    }))
  })

  it('rejects a malformed project cost item details response', async () => {
    const clientExtraField = responseClient({
      projectCostItemId: ids.item,
      totalAmount: '1000.0000',
      currencyCode: 'VND',
      details: [],
      unexpectedField: 'forbidden',
    })
    const clientInvalidKind = responseClient({
      projectCostItemId: ids.item,
      totalAmount: '1000.0000',
      currencyCode: 'VND',
      details: [{
        id: 'c1010000-0000-4000-8000-000000000002',
        projectCostItemId: ids.item,
        lineNo: 1,
        detailKind: 'invalid_kind',
        description: 'First detail line',
        quantity: null,
        unitCode: null,
        unitPrice: null,
        amount: '1000.0000',
        retentionKind: null,
        retentionRateBps: null,
        retentionAmount: null,
        relevantDate: null,
        reference: null,
        note: null,
        version: 0,
        createdAt: '2026-09-17T07:45:34.829269+00:00',
        updatedAt: '2026-09-17T07:45:34.829269+00:00',
      }],
    })
    const clientExcessRetention = responseClient({
      projectCostItemId: ids.item,
      totalAmount: '1000.0000',
      currencyCode: 'VND',
      details: [{
        id: 'c1010000-0000-4000-8000-000000000002',
        projectCostItemId: ids.item,
        lineNo: 1,
        detailKind: 'line_item',
        description: 'First detail line',
        quantity: null,
        unitCode: null,
        unitPrice: null,
        amount: '1000.0000',
        retentionKind: 'warranty',
        retentionRateBps: 500,
        retentionAmount: '1000.0001',
        relevantDate: null,
        reference: null,
        note: null,
        version: 0,
        createdAt: '2026-09-17T07:45:34.829269+00:00',
        updatedAt: '2026-09-17T07:45:34.829269+00:00',
      }],
    })

    const repositoryExtra = createHttpProjectCostRepository({ companyId: ids.company, client: clientExtraField as never })
    const repositoryInvalidKind = createHttpProjectCostRepository({ companyId: ids.company, client: clientInvalidKind as never })
    const repositoryExcessRetention = createHttpProjectCostRepository({ companyId: ids.company, client: clientExcessRetention as never })

    await expect(repositoryExtra.details(ids.item)).rejects.toThrow()
    await expect(repositoryInvalidKind.details(ids.item)).rejects.toThrow()
    await expect(repositoryExcessRetention.details(ids.item)).rejects.toThrow()
  })

  it('keeps path project IDs out of strict ordinary-detail POST bodies', async () => {
    const response = { id: ids.item, projectCostItemId: ids.item, publicationState: 'published', version: 0, replayed: false }
    const client = responseClient(response)
    const repository = createHttpProjectCostRepository({ companyId: ids.company, client: client as never })

    await repository.createDetailDraft(ids.project, { categoryId: draft.costCategoryId, description: 'draft detail' }, { idempotencyKey: ids.key })
    await repository.createAndPublishDetail(ids.project, { categoryId: draft.costCategoryId, description: 'posted detail', amount: '1.0000', sourceFigureIds: [] }, { idempotencyKey: ids.key })

    expect(client.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: `/api/companies/${ids.company}/projects/${ids.project}/cost-entry-drafts`,
      body: { categoryId: draft.costCategoryId, description: 'draft detail' },
    }))
    expect(client.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: `/api/companies/${ids.company}/projects/${ids.project}/cost-entries`,
      body: expect.objectContaining({ categoryId: draft.costCategoryId, description: 'posted detail', amount: '1.0000', sourceFigureIds: [] }),
    }))
    expect((client.request.mock.calls[0]![0].body as Record<string, unknown>).projectId).toBeUndefined()
    expect((client.request.mock.calls[1]![0].body as Record<string, unknown>).projectId).toBeUndefined()
  })
})
