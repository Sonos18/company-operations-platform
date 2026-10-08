import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMaterialProcurementRoutes } from '../../../server/features/costs/material-procurement/routes'
import { ids, split10Of20 } from '../material-procurement/fixtures'

const { getHeader, getRouterParam, readBody } = vi.hoisted(() => ({
  getHeader: vi.fn(),
  getRouterParam: vi.fn(),
  readBody: vi.fn(),
}))
vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(),
  getHeader,
  getRouterParam,
  readBody,
}))

const companyId = '10000000-0000-4000-8000-000000000001'
const key = '10000000-0000-4000-8000-000000000002'
const context = { actorId: ids.user, tenantId: companyId, companyId, requestId: key, permissions: [], db: {} }
const orderInput = {
  approvedRevisionId: ids.proposalRevision,
  supplierId: ids.supplier,
  currencyCode: 'VND',
  unsignedQuotationEvidenceFileId: ids.unsignedQuotation,
  allocations: [split10Of20.allocations[0]],
}
const evidenceInput = {
  originalFilename: 'quotation.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 128,
  sha256: 'a'.repeat(64),
  evidenceRole: 'unsigned_quotation',
  target: { kind: 'material_proposal', proposalId: ids.proposal, revisionId: ids.proposalRevision },
}

describe('material procurement order and evidence routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeader.mockReturnValue(key)
    getRouterParam.mockImplementation((_event, name) => ({
      companyId,
      projectId: ids.project,
      proposalId: ids.proposal,
      orderId: ids.order,
      fileId: ids.unsignedQuotation,
    } as Record<string, string>)[String(name)])
  })

  it('binds exact route IDs and command keys for orders and evidence', async () => {
    const service = {
      createOrder: vi.fn(), listOrders: vi.fn(), readOrder: vi.fn(), cancelOrder: vi.fn(),
      createEvidenceIntent: vi.fn(), finalizeEvidence: vi.fn(), readEvidenceUrl: vi.fn(),
    }
    const routes = createMaterialProcurementRoutes({ resolveContext: vi.fn().mockResolvedValue(context), service: service as never })
    readBody
      .mockResolvedValueOnce(orderInput)
      .mockResolvedValueOnce({ expectedOrderVersion: 1, reason: 'Supplier unavailable' })
      .mockResolvedValueOnce(evidenceInput)
      .mockResolvedValueOnce({ expectedVersion: 0 })
      .mockResolvedValueOnce({ disposition: 'attachment' })

    await routes.createOrder({} as never)
    await routes.listOrders({} as never)
    await routes.readOrder({} as never)
    await routes.cancelOrder({} as never)
    await routes.createEvidenceIntent({} as never)
    await routes.finalizeEvidence({} as never)
    await routes.readEvidenceUrl({} as never)

    expect(service.createOrder).toHaveBeenCalledWith(context, ids.project, ids.proposal, orderInput, key)
    expect(service.listOrders).toHaveBeenCalledWith(context, ids.project)
    expect(service.readOrder).toHaveBeenCalledWith(context, ids.project, ids.order)
    expect(service.cancelOrder).toHaveBeenCalledWith(context, ids.project, ids.order, { expectedOrderVersion: 1, reason: 'Supplier unavailable' }, key)
    expect(service.createEvidenceIntent).toHaveBeenCalledWith(context, ids.project, evidenceInput, key)
    expect(service.finalizeEvidence).toHaveBeenCalledWith(context, ids.project, ids.unsignedQuotation, { expectedVersion: 0 }, key)
    expect(service.readEvidenceUrl).toHaveBeenCalledWith(context, ids.project, ids.unsignedQuotation, { disposition: 'attachment' })
  })

  it('rejects non-PDF material intent before the service', async () => {
    const service = { createEvidenceIntent: vi.fn() }
    readBody.mockResolvedValue({ ...evidenceInput, mimeType: 'image/png' })
    const routes = createMaterialProcurementRoutes({ resolveContext: vi.fn().mockResolvedValue(context), service: service as never })

    await expect(routes.createEvidenceIntent({} as never)).rejects.toMatchObject({ code: 'INPUT_INVALID' })
    expect(service.createEvidenceIntent).not.toHaveBeenCalled()
  })

  it('never resolves service-role capability for auth failures or non-finalize routes', async () => {
    const resolveFinalizer = vi.fn()
    const authFailure = createMaterialProcurementRoutes({
      resolveContext: vi.fn().mockRejectedValue(new Error('AUTH_REQUIRED')),
      resolveFinalizer,
    })
    await expect(authFailure.listOrders({} as never)).rejects.toThrow('AUTH_REQUIRED')
    expect(resolveFinalizer).not.toHaveBeenCalled()

    const service = { listOrders: vi.fn(async () => []) }
    const normal = createMaterialProcurementRoutes({
      resolveContext: vi.fn().mockResolvedValue(context),
      resolveFinalizer,
      service: service as never,
    })
    await normal.listOrders({} as never)
    expect(resolveFinalizer).not.toHaveBeenCalled()
  })
})
