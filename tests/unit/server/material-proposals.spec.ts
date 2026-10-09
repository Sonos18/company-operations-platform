import { describe, expect, it, vi } from 'vitest'
import type { PermissionCode } from '../../../shared/constants/permissions'
import type {
  MaterialCommandResult,
  MaterialProposalInput,
  UpdateMaterialProposalInput,
} from '../../../shared/schemas/costs/material-procurement'
import {
  MaterialProcurementService,
  type MaterialProcurementContext,
  type MaterialProcurementDataRepository,
} from '../../../server/features/costs/material-procurement/service'
import { SupabaseMaterialProcurementRepository } from '../../../server/features/costs/material-procurement/repository'
import {
  accountantRoleScope,
  engineerRoleScope,
  ids,
  purchasingRoleScope,
  validProposal,
} from '../material-procurement/fixtures'

const tenantId = '10000000-0000-4000-8000-000000000001'
const companyId = '10000000-0000-4000-8000-000000000002'
const otherCompanyId = '10000000-0000-4000-8000-000000000003'
const requestId = '10000000-0000-4000-8000-000000000004'
const key = '10000000-0000-4000-8000-000000000005'

function context(permissions: readonly PermissionCode[]): MaterialProcurementContext {
  return {
    actorId: ids.user,
    tenantId,
    companyId,
    requestId,
    permissions,
  }
}

const proposalInput = {
  ...validProposal,
  lines: validProposal.lines.map(line => ({ ...line })),
}

const revised: UpdateMaterialProposalInput = {
  ...proposalInput,
  expectedVersion: 2,
}

const submitted: MaterialCommandResult = {
  resourceId: ids.proposal,
  version: 3,
  replayed: false,
  reviewState: 'submitted',
}

const returnedProposal = {
  id: ids.proposal,
  version: 4,
  reviewState: 'returned',
  returnReason: 'Recheck specification',
  approvedRevisionId: null,
  projectId: ids.project,
  createdBy: ids.user,
  neededOn: proposalInput.neededOn,
  deliveryAddress: proposalInput.deliveryAddress,
  notes: proposalInput.notes,
  lines: [{
    ...proposalInput.lines[0]!,
    materialName: 'Cement',
    specification: 'PCB40',
    unit: 'bag',
    allocatedQuantity: '0.0000',
    signedQuantity: '0.0000',
    remainingQuantity: '20.0000',
  }],
  orderProgress: {
    orderCount: 0,
    signedOrderCount: 0,
  },
}

function repository(overrides: Partial<MaterialProcurementDataRepository> = {}): MaterialProcurementDataRepository {
  return {
    readOrderCurrency: vi.fn(async () => ({ currencyCode: 'VND' as const })),
    listProjects: vi.fn(async () => []),
    listMaterials: vi.fn(async () => []),
    createMaterial: vi.fn(async () => submitted),
    updateMaterial: vi.fn(async () => submitted),
    listSupplierNames: vi.fn(async () => []),
    recordSupplierName: vi.fn(async () => submitted),
    resolveSupplier: vi.fn(async () => submitted),
    listProposals: vi.fn(async () => []),
    readProposal: vi.fn(),
    createProposal: vi.fn(async () => submitted),
    updateProposal: vi.fn(async () => submitted),
    submitProposal: vi.fn(async () => submitted),
    decideProposal: vi.fn(async () => ({ ...submitted, reviewState: 'approved' as const })),
    createOrder: vi.fn(async () => submitted),
    listOrders: vi.fn(async () => []),
    readOrder: vi.fn(),
    cancelOrder: vi.fn(async () => submitted),
    createEvidenceIntent: vi.fn(),
    finalizeEvidence: vi.fn(),
    readEvidenceUrl: vi.fn(),
    ...overrides,
  }
}

describe('material proposal service', () => {
  it('keeps purchasing from editing an engineer proposal and lets its engineer resubmit a returned revision', async () => {
    const data = repository()
    const service = new MaterialProcurementService(data)

    await expect(service.updateProposal(
      context(purchasingRoleScope),
      ids.project,
      ids.proposal,
      revised,
      key,
    )).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(data.updateProposal).not.toHaveBeenCalled()

    await expect(service.submitProposal(
      context(engineerRoleScope),
      ids.project,
      ids.proposal,
      { expectedVersion: 2 },
      key,
    )).resolves.toMatchObject({ reviewState: 'submitted', version: 3 })
  })

  it('lets purchasing decide only and requires a reason when returning', async () => {
    const data = repository()
    const service = new MaterialProcurementService(data)

    await expect(service.decideProposal(
      context(engineerRoleScope),
      ids.project,
      ids.proposal,
      { expectedVersion: 2, decision: 'approve' },
      key,
    )).rejects.toMatchObject({ statusCode: 403 })

    await expect(service.decideProposal(
      context(purchasingRoleScope),
      ids.project,
      ids.proposal,
      { expectedVersion: 2, decision: 'return', reason: ' ' },
      key,
    )).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(data.decideProposal).not.toHaveBeenCalled()

    await service.decideProposal(
      context(purchasingRoleScope),
      ids.project,
      ids.proposal,
      { expectedVersion: 2, decision: 'approve' },
      key,
    )
    expect(data.decideProposal).toHaveBeenCalledOnce()
  })

  it('rejects supplier, price, tenant, company, and actor fields in engineer proposal input', async () => {
    const data = repository()
    const service = new MaterialProcurementService(data)
    const forged = {
      ...proposalInput,
      supplierId: ids.supplier,
      actorId: ids.user,
      tenantId,
      companyId: otherCompanyId,
      lines: [{ ...proposalInput.lines[0]!, unitPrice: '12.5000' }],
    }

    await expect(service.createProposal(
      context(engineerRoleScope),
      ids.project,
      forged,
      key,
    )).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(data.createProposal).not.toHaveBeenCalled()
  })

  it('restricts supplier aliases to supplier-record buyers or contract-record accountants', async () => {
    const data = repository()
    const service = new MaterialProcurementService(data)

    await expect(service.listSupplierNames(context(engineerRoleScope), ids.material))
      .rejects.toMatchObject({
        statusCode: 403,
        code: 'PERMISSION_DENIED',
      })
    expect(data.listSupplierNames).not.toHaveBeenCalled()

    await expect(service.listSupplierNames(context(purchasingRoleScope), ids.material))
      .resolves.toEqual([])
    await expect(service.listSupplierNames(context(accountantRoleScope), ids.material))
      .resolves.toEqual([])
    expect(data.listSupplierNames).toHaveBeenCalledTimes(2)
  })
})

describe('material proposal RPC boundary', () => {
  it.each([
    ['PERMISSION_DENIED', 403],
    ['RESOURCE_NOT_FOUND', 404],
    ['VERSION_CONFLICT', 409],
    ['IDEMPOTENCY_CONFLICT', 409],
  ] as const)('maps %s without exposing database details', async (code, statusCode) => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: code } }))
    const data = new SupabaseMaterialProcurementRepository({ rpc } as never)

    await expect(data.updateProposal(
      context(engineerRoleScope),
      ids.project,
      ids.proposal,
      revised,
      key,
    )).rejects.toMatchObject({ code, statusCode })
  })

  it('binds trusted company/project/request scope and preserves retry identity', async () => {
    const seen = new Map<string, string>()
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const payload = JSON.stringify(args.target_input)
      const previous = seen.get(String(args.target_idempotency_key))
      if (previous !== undefined && previous !== payload) {
        return { data: null, error: { message: 'IDEMPOTENCY_CONFLICT' } }
      }
      seen.set(String(args.target_idempotency_key), payload)
      return { data: { ...submitted, replayed: previous !== undefined }, error: null }
    })
    const data = new SupabaseMaterialProcurementRepository({ rpc } as never)

    await expect(data.createProposal(context(engineerRoleScope), ids.project, proposalInput, key))
      .resolves.toMatchObject({ replayed: false, resourceId: ids.proposal })
    await expect(data.createProposal(context(engineerRoleScope), ids.project, proposalInput, key))
      .resolves.toMatchObject({ replayed: true, resourceId: ids.proposal })
    await expect(data.createProposal(
      context(engineerRoleScope),
      ids.project,
      { ...proposalInput, deliveryAddress: 'Other site' } as MaterialProposalInput,
      key,
    )).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', statusCode: 409 })

    expect(rpc.mock.calls[0]).toEqual([
      'c1_material_create_proposal',
      {
        target_company_id: companyId,
        target_project_id: ids.project,
        target_input: proposalInput,
        target_idempotency_key: key,
        target_request_id: requestId,
      },
    ])
  })

  it('propagates the buyer return reason through proposal read and list responses', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'c1_material_list_proposals' ? [returnedProposal] : returnedProposal,
      error: null,
    }))
    const data = new SupabaseMaterialProcurementRepository({ rpc } as never)

    await expect(data.readProposal(context(engineerRoleScope), ids.project, ids.proposal))
      .resolves.toMatchObject({
        reviewState: 'returned',
        returnReason: 'Recheck specification',
      })
    await expect(data.listProposals(context(engineerRoleScope), ids.project))
      .resolves.toEqual([
        expect.objectContaining({ returnReason: 'Recheck specification' }),
      ])
  })

  it.each(['draft', 'submitted', 'approved'] as const)(
    'accepts %s proposal responses only with a null return reason',
    async (reviewState) => {
      const rpc = vi.fn(async () => ({
        data: { ...returnedProposal, reviewState, returnReason: null },
        error: null,
      }))
      const data = new SupabaseMaterialProcurementRepository({ rpc } as never)

      await expect(data.readProposal(context(engineerRoleScope), ids.project, ids.proposal))
        .resolves.toMatchObject({ reviewState, returnReason: null })
    },
  )

  it.each([
    ['returned', null],
    ['draft', 'Stale buyer reason'],
    ['submitted', 'Stale buyer reason'],
    ['approved', 'Stale buyer reason'],
  ] as const)(
    'rejects %s proposal responses with inconsistent return reason %s',
    async (reviewState, returnReason) => {
      const rpc = vi.fn(async () => ({
        data: { ...returnedProposal, reviewState, returnReason },
        error: null,
      }))
      const data = new SupabaseMaterialProcurementRepository({ rpc } as never)

      await expect(data.readProposal(context(engineerRoleScope), ids.project, ids.proposal))
        .rejects.toMatchObject({
          statusCode: 500,
          code: 'INTERNAL_ERROR',
        })
    },
  )

  it('rejects malformed or non-camelCase RPC payloads', async () => {
    const rpc = vi.fn(async () => ({
      data: { resource_id: ids.proposal, version: 1, replayed: false },
      error: null,
    }))
    const data = new SupabaseMaterialProcurementRepository({ rpc } as never)

    await expect(data.submitProposal(
      context(engineerRoleScope),
      ids.project,
      ids.proposal,
      { expectedVersion: 0 },
      key,
    )).rejects.toMatchObject({ code: 'INTERNAL_ERROR', statusCode: 500 })
  })
})
