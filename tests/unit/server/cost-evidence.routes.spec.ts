import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCostEvidenceRoutes } from '../../../server/features/costs/evidence/cost-evidence.routes'

const { getHeader, getRouterParam, readBody } = vi.hoisted(() => ({ getHeader: vi.fn(), getRouterParam: vi.fn(), readBody: vi.fn() }))
vi.mock('h3', async importOriginal => ({ ...await importOriginal<typeof import('h3')>(), getHeader, getRouterParam, readBody }))
const ids = { companyId: 'c1070000-0000-4000-8000-000000000020', projectId: 'c1070000-0000-4000-8000-000000000101', costId: 'c1070000-0000-4000-8000-000000000201', fileId: 'c1070000-0000-4000-8000-000000000401', key: 'c1070000-0000-4000-8000-000000000701' }
const context = { actorId: 'c1070000-0000-4000-8000-000000000901', tenantId: 'c1070000-0000-4000-8000-000000000010', companyId: ids.companyId, permissions: ['cost.prepare'], requestId: 'c1070000-0000-4000-8000-000000000702', db: {} }

describe('cost evidence routes', () => {
  beforeEach(() => {
    vi.clearAllMocks(); getHeader.mockReturnValue(ids.key)
    getRouterParam.mockImplementation((_event, name) => ({ companyId: ids.companyId, projectId: ids.projectId, projectCostItemId: ids.costId, evidenceFileId: ids.fileId }[name]))
  })

  it('binds intent, finalize, link, metadata, and read URL to exact route IDs', async () => {
    const service = { createIntent: vi.fn(), finalize: vi.fn(), linkCost: vi.fn(), listCostEvidence: vi.fn(), createReadUrl: vi.fn() }
    const routes = createCostEvidenceRoutes({ resolveContext: vi.fn().mockResolvedValue(context), service: service as never })
    readBody.mockResolvedValueOnce({ originalFilename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 8, sha256: 'a'.repeat(64) })
      .mockResolvedValueOnce({ expectedVersion: 0 }).mockResolvedValueOnce({ evidenceFileId: ids.fileId, evidenceKind: 'invoice' }).mockResolvedValueOnce({ disposition: 'inline' })
    await routes.createIntent({} as never); await routes.finalize({} as never); await routes.linkCost({} as never); await routes.listCostEvidence({} as never); await routes.createReadUrl({} as never)
    expect(service.createIntent).toHaveBeenCalledWith(context, ids.projectId, expect.anything(), ids.key)
    expect(service.finalize).toHaveBeenCalledWith(context, ids.fileId, { expectedVersion: 0 }, ids.key)
    expect(service.linkCost).toHaveBeenCalledWith(context, ids.costId, { evidenceFileId: ids.fileId, evidenceKind: 'invoice' }, ids.key)
    expect(service.listCostEvidence).toHaveBeenCalledWith(context, ids.costId)
    expect(service.createReadUrl).toHaveBeenCalledWith(context, ids.fileId, { disposition: 'inline' })
  })

  it('rejects a missing idempotency key before mutation service calls', async () => {
    getHeader.mockReturnValue(undefined); readBody.mockResolvedValue({ expectedVersion: 0 })
    const service = { finalize: vi.fn() }
    await expect(createCostEvidenceRoutes({ resolveContext: vi.fn().mockResolvedValue(context), service: service as never }).finalize({} as never)).rejects.toMatchObject({ code: 'INPUT_INVALID' })
    expect(service.finalize).not.toHaveBeenCalled()
  })
})
