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
