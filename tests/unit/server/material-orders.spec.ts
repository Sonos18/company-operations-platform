import { describe, expect, it, vi } from 'vitest'
import type { PermissionCode } from '../../../shared/constants/permissions'
import type { MaterialProcurementDataRepository, MaterialProcurementContext } from '../../../server/features/costs/material-procurement/service'
import { MaterialProcurementService } from '../../../server/features/costs/material-procurement/service'
import { SupabaseMaterialProcurementRepository } from '../../../server/features/costs/material-procurement/repository'
import { accountantRoleScope, engineerRoleScope, ids, purchasingRoleScope } from '../material-procurement/fixtures'

const tenantId = '10000000-0000-4000-8000-000000000001'
const companyId = '10000000-0000-4000-8000-000000000002'
const requestId = '10000000-0000-4000-8000-000000000003'
const key = '10000000-0000-4000-8000-000000000004'
const orderInput = {
  approvedRevisionId: ids.proposalRevision,
  supplierId: ids.supplier,
  currencyCode: 'VND' as const,
  unsignedQuotationEvidenceFileId: ids.unsignedQuotation,
  allocations: [{
    proposalLineId: ids.proposalLine,
    quantity: '10.0000',
    unitPrice: '12.5000',
    quotationMaterialName: 'Supplier steel',
    mappingConfirmed: true as const,
  }],
}
const orderView = {
  id: ids.order,
  version: 1,
  orderState: 'active' as const,
  proposalId: ids.proposal,
  approvedRevisionId: ids.proposalRevision,
  supplierId: ids.supplier,
  supplierName: 'Supplier A',
  currencyCode: 'VND' as const,
  allocations: [{
    orderLineId: ids.orderLine,
    ...orderInput.allocations[0],
    materialId: ids.material,
    materialName: 'Steel',
    specification: 'D10',
    unit: 'bag',
  }],
  unsignedQuotationEvidenceFileId: ids.unsignedQuotation,
  contract: null,
  cash: { grossPaid: '0.0000', availableToPay: '0.0000' },
}
const commandResult = { resourceId: ids.order, version: 1, replayed: false }

function context(permissions: readonly PermissionCode[]): MaterialProcurementContext {
  return { actorId: ids.user, tenantId, companyId, requestId, permissions }
}

function repository(overrides: Partial<MaterialProcurementDataRepository> = {}): MaterialProcurementDataRepository {
  return {
    listProjects: vi.fn(async () => []),
    listMaterials: vi.fn(async () => []),
    createMaterial: vi.fn(async () => commandResult),
    updateMaterial: vi.fn(async () => commandResult),
    listSupplierNames: vi.fn(async () => []),
    recordSupplierName: vi.fn(async () => commandResult),
    resolveSupplier: vi.fn(async () => commandResult),
    listProposals: vi.fn(async () => []),
    readProposal: vi.fn(),
    createProposal: vi.fn(async () => commandResult),
    updateProposal: vi.fn(async () => commandResult),
    submitProposal: vi.fn(async () => commandResult),
    decideProposal: vi.fn(async () => commandResult),
    createOrder: vi.fn(async () => commandResult),
    listOrders: vi.fn(async () => [orderView]),
    readOrder: vi.fn(async () => orderView),
    cancelOrder: vi.fn(async () => ({ ...commandResult, version: 2 })),
    createEvidenceIntent: vi.fn(),
    finalizeEvidence: vi.fn(),
    readEvidenceUrl: vi.fn(),
    ...overrides,
  }
}

describe('material order service', () => {
  it('denies engineer financial reads before the RPC and allows scoped financial roles', async () => {
    const data = repository()
    const service = new MaterialProcurementService(data)

    await expect(service.listOrders(context(engineerRoleScope), ids.project))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    await expect(service.readOrder(context(engineerRoleScope), ids.project, ids.order))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(data.listOrders).not.toHaveBeenCalled()
    expect(data.readOrder).not.toHaveBeenCalled()

    await expect(service.listOrders(context(purchasingRoleScope), ids.project)).resolves.toEqual([orderView])
    await expect(service.readOrder(context(accountantRoleScope), ids.project, ids.order)).resolves.toEqual(orderView)
  })

  it('lets only a buyer create and cancel orders with validated input', async () => {
    const data = repository()
    const service = new MaterialProcurementService(data)

    await expect(service.createOrder(context(engineerRoleScope), ids.project, ids.proposal, orderInput, key))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(service.cancelOrder(context(accountantRoleScope), ids.project, ids.order, {
      expectedOrderVersion: 1,
      reason: 'Supplier unavailable',
    }, key)).rejects.toMatchObject({ statusCode: 403 })
    expect(data.createOrder).not.toHaveBeenCalled()
    expect(data.cancelOrder).not.toHaveBeenCalled()

    await service.createOrder(context(purchasingRoleScope), ids.project, ids.proposal, orderInput, key)
    await service.cancelOrder(context(purchasingRoleScope), ids.project, ids.order, {
      expectedOrderVersion: 1,
      reason: 'Supplier unavailable',
    }, key)
    expect(data.createOrder).toHaveBeenCalledWith(expect.anything(), ids.project, ids.proposal, orderInput, key)
    expect(data.cancelOrder).toHaveBeenCalledWith(expect.anything(), ids.project, ids.order, {
      expectedOrderVersion: 1,
      reason: 'Supplier unavailable',
    }, key)

    await expect(service.cancelOrder(context(purchasingRoleScope), ids.project, ids.order, {
      expectedOrderVersion: 2,
      reason: ' ',
    }, key)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
  })
})

describe('material order RPC boundary', () => {
  it('uses the frozen order RPC names and exact trusted arguments', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'c1_material_list_orders' ? [orderView]
        : name === 'c1_material_read_order' ? orderView
          : commandResult,
      error: null,
    }))
    const data = new SupabaseMaterialProcurementRepository({ rpc } as never)
    const ctx = context(purchasingRoleScope)

    await data.createOrder(ctx, ids.project, ids.proposal, orderInput, key)
    await data.listOrders(ctx, ids.project)
    await data.readOrder(ctx, ids.project, ids.order)
    await data.cancelOrder(ctx, ids.project, ids.order, {
      expectedOrderVersion: 1,
      reason: 'Supplier unavailable',
    }, key)

    expect(rpc.mock.calls).toEqual([
      ['c1_material_create_order', {
        target_company_id: companyId,
        target_project_id: ids.project,
        target_id: ids.proposal,
        target_input: orderInput,
        target_idempotency_key: key,
        target_request_id: requestId,
      }],
      ['c1_material_list_orders', {
        target_company_id: companyId,
        target_project_id: ids.project,
      }],
      ['c1_material_read_order', {
        target_company_id: companyId,
        target_project_id: ids.project,
        target_id: ids.order,
      }],
      ['c1_material_cancel_order', {
        target_company_id: companyId,
        target_project_id: ids.project,
        target_id: ids.order,
        target_input: { expectedOrderVersion: 1, reason: 'Supplier unavailable' },
        target_idempotency_key: key,
        target_request_id: requestId,
      }],
    ])
  })
})
