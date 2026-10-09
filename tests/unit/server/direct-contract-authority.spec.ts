import { describe, expect, it, vi } from 'vitest'
import { commitMaterialContractInputSchema, materialContractCommandResultSchema, materialOrderViewSchema } from '../../../shared/schemas/costs/material-procurement'
import { MaterialProcurementService, type MaterialProcurementContext, type MaterialProcurementDataRepository } from '../../../server/features/costs/material-procurement/service'
import { SupabaseMaterialProcurementRepository } from '../../../server/features/costs/material-procurement/repository'
import { CostWorkflowCashService, type WorkflowCashRepository } from '../../../server/features/costs/workflow/cost-workflow-cash.service'
import { CostWorkflowEvidenceService, type WorkflowEvidenceRepository } from '../../../server/features/costs/workflow/cost-workflow-evidence.service'
import { accountantRoleScope, ids, signedContractInput } from '../material-procurement/fixtures'

const context: MaterialProcurementContext = {
  actorId: ids.user, tenantId: ids.user, companyId: ids.user, requestId: ids.user,
  permissions: accountantRoleScope,
}
const key = ids.user
const contractAck = {
  resourceId: ids.order, version: 2, replayed: false, contractId: ids.contract,
  authorizationId: ids.authority, installmentId: ids.installment, notificationId: ids.user,
}
const payment = {
  amount: '30.0000', currencyCode: 'VND', paymentDate: '2026-10-08', reference: 'Bank transfer',
  evidenceFileIds: [ids.paymentProof], expectedVersion: 0, invoiceEvidenceFileId: ids.invoice,
  invoiceNames: [{ orderLineId: ids.orderLine, name: 'Supplier steel' }],
}

describe('signed material contract boundary', () => {
  it('keeps a dedicated strict record result and a canonical installment counter', () => {
    expect(commitMaterialContractInputSchema.parse({ ...signedContractInput, existingContractId: ids.contract }).existingContractId).toBe(ids.contract)
    expect(materialContractCommandResultSchema.parse(contractAck)).toEqual(contractAck)
    expect(() => materialContractCommandResultSchema.parse({ ...contractAck, notificationId: undefined })).toThrow()
    expect(materialOrderViewSchema.shape.cash.parse({ grossPaid: '10.0000', availableToPay: '90.0000', installmentVersion: 0 }).installmentVersion).toBe(0)
    expect(materialOrderViewSchema.shape.cash.parse({ grossPaid: '0.0000', availableToPay: '0.0000', installmentVersion: null }).installmentVersion).toBeNull()
  })

  it('requires accountant authority and two distinct reviewed signed documents', async () => {
    const recordContract = vi.fn(async () => contractAck)
    const service = new MaterialProcurementService({ recordContract } as unknown as MaterialProcurementDataRepository)
    await expect(service.recordContract({ ...context, permissions: ['material.read'] }, ids.project, ids.order, signedContractInput, key))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(service.recordContract({ ...context, permissions: ['material.contract.record'] }, ids.project, ids.order, signedContractInput, key))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(service.recordContract(context, ids.project, ids.order, { ...signedContractInput, signedQuotationEvidenceFileId: ids.signedContract }, key))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(recordContract).not.toHaveBeenCalled()
    await expect(service.recordContract(context, ids.project, ids.order, signedContractInput, key)).resolves.toEqual(contractAck)
    expect(recordContract).toHaveBeenCalledWith(context, ids.project, ids.order, signedContractInput, key)
  })

  it('uses the dedicated contract RPC/result without changing ordinary command results', async () => {
    const rpc = vi.fn(async () => ({ data: contractAck, error: null }))
    const repository = new SupabaseMaterialProcurementRepository({ rpc } as never)
    await expect(repository.recordContract(context, ids.project, ids.order, signedContractInput, key)).resolves.toEqual(contractAck)
    expect(rpc).toHaveBeenCalledWith('c1_material_record_contract', {
      target_company_id: context.companyId, target_project_id: ids.project, target_id: ids.order,
      target_input: signedContractInput, target_idempotency_key: key, target_request_id: context.requestId,
    })
  })

  it('maps typed canonical contract and physical-source conflicts to actionable 409s', async () => {
    for (const code of ['MATERIAL_CONTRACT_MISMATCH', 'MATERIAL_CONTRACT_SOURCE_CONFLICT']) {
      const rpc = vi.fn(async () => ({ data: null, error: { message: code } }))
      const repository = new SupabaseMaterialProcurementRepository({ rpc } as never)
      await expect(repository.recordContract(context, ids.project, ids.order, signedContractInput, key))
        .rejects.toMatchObject({ statusCode: 409, code })
    }
  })

  it('routes stored direct cash with only cash permission and preserves strict legacy input', async () => {
    const repository = {
      authoritySource: vi.fn(async () => 'direct_authorization' as const),
      confirmPayment: vi.fn(async () => ({ paymentId: ids.order, version: 1, replayed: false })),
    } as unknown as WorkflowCashRepository
    const service = new CostWorkflowCashService(repository)
    await expect(service.confirmPayment(context, ids.project, ids.installment, payment, key))
      .resolves.toMatchObject({ version: 1 })
    expect(repository.confirmPayment).toHaveBeenCalledWith(context, ids.project, ids.installment, payment, key)
    await expect(service.confirmPayment(context, ids.project, ids.installment, { ...payment, authoritySource: 'manager_decision' }, key))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(service.confirmPayment(context, ids.project, ids.installment, { ...payment, invoiceEvidenceFileId: undefined }, key))
      .rejects.toMatchObject({ statusCode: 400 })
    vi.mocked(repository.authoritySource).mockResolvedValue('manager_decision')
    await expect(service.confirmPayment(context, ids.project, ids.installment, payment, key))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('uses only the order-scoped contract selector with read and record permissions', async () => {
    const listEligibleContracts = vi.fn(async () => [{ id: ids.contract, reference: 'HD-VT-001', cap: '100.0000', currencyCode: 'VND' }])
    const service = new MaterialProcurementService({ listEligibleContracts } as unknown as MaterialProcurementDataRepository)
    await expect(service.listEligibleContracts({ ...context, permissions: ['material.read'] }, ids.project, ids.order))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(service.listEligibleContracts(context, ids.project, ids.order)).resolves.toHaveLength(1)
    expect(listEligibleContracts).toHaveBeenCalledWith(context, ids.project, ids.order)
  })

  it('keeps direct finalize/read under cash authority and legacy evidence unchanged', async () => {
    const repository = {
      directEvidenceSource: vi.fn(async () => true),
      finalizeDirect: vi.fn(async () => ({ id: ids.invoice })),
      createDirectReadUrl: vi.fn(async () => ({ url: 'https://example.test/invoice' })),
      finalize: vi.fn(), createReadUrl: vi.fn(), createIntent: vi.fn(async () => ({ evidenceFileId: ids.paymentProof })),
    } as unknown as WorkflowEvidenceRepository
    const service = new CostWorkflowEvidenceService(repository)
    await service.finalize(context, ids.project, ids.invoice, { expectedVersion: 0 }, key)
    await service.createReadUrl(context, ids.project, ids.invoice, { disposition: 'inline' })
    expect(repository.finalizeDirect).toHaveBeenCalledOnce()
    expect(repository.createDirectReadUrl).toHaveBeenCalledOnce()
    expect(repository.finalize).not.toHaveBeenCalled()
    vi.mocked(repository.directEvidenceSource).mockResolvedValue(false)
    await expect(service.finalize(context, ids.project, ids.invoice, { expectedVersion: 0 }, key))
      .rejects.toMatchObject({ statusCode: 403 })
    const legacyContext = { ...context, permissions: ['cost.request.submit', 'cost.prepare'] as const }
    await service.createIntent(legacyContext, ids.project, {
      target: { kind: 'payment', id: ids.installment }, evidenceKind: 'payment_proof',
      originalFilename: 'proof.png', mimeType: 'image/png', sizeBytes: 100, sha256: 'b'.repeat(64),
    }, key)
    expect(repository.createIntent).toHaveBeenCalledOnce()
  })

  it('selects direct invoice/proof intent from stored payment source', async () => {
    const repository = {
      paymentAuthoritySource: vi.fn(async () => 'direct_authorization' as const),
      createDirectIntent: vi.fn(async () => ({ evidenceFileId: ids.invoice })),
      createIntent: vi.fn(),
    } as unknown as WorkflowEvidenceRepository
    const service = new CostWorkflowEvidenceService(repository)
    const intent = {
      target: { kind: 'payment', id: ids.installment }, evidenceKind: 'invoice',
      originalFilename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 100,
      sha256: 'a'.repeat(64),
    }
    await service.createIntent(context, ids.project, intent, key)
    expect(repository.createDirectIntent).toHaveBeenCalledOnce()
    expect(repository.createIntent).not.toHaveBeenCalled()
  })
})
