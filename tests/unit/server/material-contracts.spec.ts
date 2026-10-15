import { describe, expect, it, vi } from 'vitest'
import type { PermissionCode } from '../../../shared/constants/permissions'
import { MaterialContractService, type MaterialContractDataRepository } from '../../../server/features/costs/material-finance/contract-service'

const ids = {
  project: '20000000-0000-4000-8000-000000000001',
  order: '20000000-0000-4000-8000-000000000002',
  contract: '20000000-0000-4000-8000-000000000003',
  key: '20000000-0000-4000-8000-000000000004',
  file1: '20000000-0000-4000-8000-000000000005',
  file2: '20000000-0000-4000-8000-000000000006',
  inst1: '20000000-0000-4000-8000-000000000007',
  user: '20000000-0000-4000-8000-000000000008',
}
const ctx = (permissions: PermissionCode[]) => ({
  actorId: ids.user, tenantId: ids.user, companyId: ids.user, requestId: ids.key, permissions,
})
const input = {
  expectedOrderVersion: 1, contractNo: 'HD-01', signedOn: '2026-10-10',
  subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000', varianceReason: null,
  contractFileId: ids.file1, signedQuotationFileId: ids.file2,
  installments: [{ installmentKey: ids.inst1, name: 'Thanh toán 100%', amount: '110.0000', dueOn: '2026-10-10', isAdvance: false }],
}
const facts = {
  id: ids.contract, orderId: ids.order, projectId: ids.project, supplierId: ids.user, supplierName: 'NCC A',
  currencyCode: 'VND', contractNo: 'HD-01', signedOn: '2026-10-10', currentVersionNo: 1, version: 1, invoiced: '0.0000',
  versions: [{
    versionNo: 1, kind: 'original', subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000',
    orderSubtotalSnapshot: '100.0000', varianceReason: null, contractFileId: ids.file1, signedQuotationFileId: ids.file2,
    reason: null, recordedBy: ids.user, recordedAt: '2026-10-10T01:00:00+00:00',
  }],
  installments: [{ installmentKey: ids.inst1, seq: 1, name: 'Thanh toán 100%', amount: '110.0000', dueOn: '2026-10-10', isAdvance: false, paid: '10.0000', pending: '0.0000' }],
}

function repo(overrides: Partial<MaterialContractDataRepository> = {}): MaterialContractDataRepository {
  return {
    readContractFacts: vi.fn(async () => facts),
    recordContract: vi.fn(async () => ({ resourceId: ids.contract, version: 1, replayed: false })),
    amendContract: vi.fn(async () => ({ resourceId: ids.contract, version: 2, replayed: false })),
    ...overrides,
  }
}

describe('material contract service', () => {
  it('denies recording without material.contract.record before calling the repository', async () => {
    const repository = repo()
    await expect(new MaterialContractService(repository).recordContract(ctx(['material.read', 'material.order.manage']), ids.project, ids.order, input, ids.key))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(repository.recordContract).not.toHaveBeenCalled()
  })

  it('rejects unbalanced installments with 400 before calling the repository', async () => {
    const repository = repo()
    await expect(new MaterialContractService(repository).recordContract(
      ctx(['material.read', 'material.contract.record']), ids.project, ids.order,
      { ...input, installments: [{ ...input.installments[0], amount: '100.0000' }] }, ids.key,
    )).rejects.toMatchObject({ statusCode: 400 })
    expect(repository.recordContract).not.toHaveBeenCalled()
  })

  it('computes totals and due status from facts using today in Vietnam', async () => {
    const service = new MaterialContractService(repo(), () => new Date('2026-10-14T18:00:00Z'))
    const view = await service.readContract(ctx(['material.read', 'material.finance.read']), ids.project, ids.order)
    expect(view?.totals).toMatchObject({ committed: '110.0000', paid: '10.0000', remaining: '100.0000', overdue: '100.0000' })
    expect(view?.installments[0]).toMatchObject({ remaining: '100.0000', dueStatus: 'overdue' })
  })

  it('returns null when the order has no contract', async () => {
    const service = new MaterialContractService(repo({ readContractFacts: vi.fn(async () => null) }))
    expect(await service.readContract(ctx(['material.read', 'material.finance.read']), ids.project, ids.order)).toBeNull()
  })

  it('denies contract detail to a buyer without finance permissions', async () => {
    await expect(new MaterialContractService(repo()).readContract(ctx(['material.read', 'material.order.manage']), ids.project, ids.order))
      .rejects.toMatchObject({ statusCode: 403 })
  })
})
