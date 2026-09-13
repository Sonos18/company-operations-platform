import { describe, expect, it, vi } from 'vitest'
import { createAccountingSourceService, normalizeSourceLocator } from '../../../server/features/costs/accounting-source.service'

const tenantId = 'c1000000-0000-4000-8000-000000000010'
const companyId = 'c1000000-0000-4000-8000-000000000020'
const actorId = 'c1000000-0000-4000-8000-000000000901'
const sourceId = 'c1000000-0000-4000-8000-000000000050'
const versionId = 'c1000000-0000-4000-8000-000000000051'
const selectionId = 'c1000000-0000-4000-8000-000000000052'
const figureId = 'c1000000-0000-4000-8000-000000000053'
const context = (permissions = ['cost.source.read', 'cost.prepare', 'cost.publish_import'] as const) => ({ actorId, tenantId, companyId, permissions, requestId: 'c1000000-0000-4000-8000-000000000099' })

describe('C1 accounting source intake', () => {
  it('creates a source/version before any project or engagement and never activates finance', async () => {
    const repository = { createSource: vi.fn(async () => ({ id: sourceId, version: 0 })), createVersion: vi.fn(async () => ({ id: versionId, status: 'draft', file: { state: 'pending' } })), getVersion: vi.fn(), shareVersion: vi.fn() }
    const service = createAccountingSourceService(repository as never)
    await expect(service.createSource(context(), { code: 'SRC-01', title: 'Mixed source', sourceSystem: 'spreadsheet' })).resolves.toMatchObject({ id: sourceId })
    await expect(service.createVersion(context(), sourceId, { originalName: 'mixed.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).resolves.toMatchObject({ id: versionId, status: 'draft' })
    expect(repository.createSource).toHaveBeenCalledWith(expect.not.objectContaining({ suggestedProjectId: expect.any(String) }))
    expect(repository.createVersion).toHaveBeenCalledWith(expect.objectContaining({ sourceId, projectId: undefined, engagementId: undefined }))
  })

  it('shares only a ready version and records no financial publication side effect', async () => {
    const repository = { getVersion: vi.fn(async () => ({ id: versionId, status: 'draft', file: { state: 'ready' } })), shareVersion: vi.fn(async () => ({ id: versionId, status: 'shared' })), createSource: vi.fn(), createVersion: vi.fn() }
    const service = createAccountingSourceService(repository as never)
    await expect(service.shareVersion(context(), versionId, { idempotencyKey: 'c1000000-0000-4000-8000-000000000098' })).resolves.toMatchObject({ status: 'shared', financialActivation: false })
    expect(repository.shareVersion).toHaveBeenCalledTimes(1)
  })

  it('normalizes A1 bounds without changing Unicode or meaningful sheet whitespace', () => {
    expect(normalizeSourceLocator({ kind: 'cell_range', sheetName: ' Nhật ký ', range: 'b2:a1' })).toEqual({ kind: 'cell_range', sheetName: ' Nhật ký ', range: 'A1:B2', locatorKey: 'cell_range| Nhật ký |A1:B2' })
  })

  it('keeps pending selections non-posting and rejects premature normalization', async () => {
    const repository = { createSelection: vi.fn(async input => input), createSource: vi.fn(), createVersion: vi.fn(), getVersion: vi.fn(), shareVersion: vi.fn() }
    const service = createAccountingSourceService(repository as never)
    await expect(service.createSelection(context(), versionId, { locator: { kind: 'whole_file' }, sourceRole: 'unknown', handling: 'pending' })).resolves.toMatchObject({ handling: 'pending', financialActivation: false })
    await expect(service.createSelection(context(), versionId, { locator: { kind: 'whole_file' }, sourceRole: 'unknown', handling: 'ready_for_normalization' })).rejects.toMatchObject({ code: 'SOURCE_SELECTION_SCOPE_MISMATCH' })
  })

  it('shares figures as immutable non-posting snapshots and revisions retain the family', async () => {
    const repository = { createFigure: vi.fn(async input => ({ ...input, id: figureId, status: 'draft', version: 0 })), getFigure: vi.fn(async () => ({ id: figureId, status: 'shared', sourceVersionStatus: 'shared', figureFamilyId: figureId, revisionNo: 1 })), shareFigure: vi.fn(async () => ({ id: figureId, status: 'shared', revisionNo: 1 })), createRevision: vi.fn(async () => ({ id: 'c1000000-0000-4000-8000-000000000054', figureFamilyId: figureId, revisionNo: 2, status: 'draft' })), createSource: vi.fn(), createVersion: vi.fn(), getVersion: vi.fn(), shareVersion: vi.fn() }
    const service = createAccountingSourceService(repository as never)
    await expect(service.shareFigure(context(), figureId, { idempotencyKey: 'c1000000-0000-4000-8000-000000000097' })).resolves.toMatchObject({ financialActivation: false, revisionNo: 1 })
    await expect(service.updateFigure(context(), figureId, { expectedVersion: 1, label: 'forbidden' })).rejects.toMatchObject({ code: 'SOURCE_FIGURE_IMMUTABLE' })
    await expect(service.createFigureRevision(context(), figureId, { label: 'Corrected source', rawValueText: '12.3400', valueState: 'known', amount: '12.3400', basis: 'unknown', scopeDescription: 'Unverified source scope', expectedVersion: 1 })).resolves.toMatchObject({ figureFamilyId: figureId, revisionNo: 2 })
  })

  it('creates a draft source figure without a financial line or KPI mutation', async () => {
    const createFigure = vi.fn(async input => ({ ...input, id: figureId, status: 'draft', version: 0 }))
    const service = createAccountingSourceService({ createFigure } as never)
    await expect(service.createFigure(context(), selectionId, { label: 'Reported balance', metricKind: 'reported_balance', rawValueText: '-12.3400', valueState: 'known', amount: '-12.3400', basis: 'unknown', scopeDescription: 'Whole project source' })).resolves.toMatchObject({ status: 'draft', financialActivation: false })
    expect(createFigure).toHaveBeenCalledWith(expect.objectContaining({ selectionId, financialActivation: false }))
  })

  it('does not let cost.read or project.read substitute for source preparation', async () => {
    const service = createAccountingSourceService({ createSource: vi.fn() } as never)
    await expect(service.createSource(context(['cost.read'] as never), { code: 'SRC-01', title: 'Denied', sourceSystem: 'spreadsheet' })).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
  })
})
