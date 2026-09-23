import { describe, expect, it, vi } from 'vitest'
import { ProjectFinanceWriteService } from '../../../server/features/costs/finance/project-finance-write.service'
import { ProjectFinanceWriteRepository } from '../../../server/features/costs/finance/project-finance-write.repository'
const ids = { tenant: 'c1080000-0000-4000-8000-000000000010', company: 'c1080000-0000-4000-8000-000000000020', project: 'c1080000-0000-4000-8000-000000000101', subcontract: 'c1080000-0000-4000-8000-000000000301', payment: 'c1080000-0000-4000-8000-000000000401', key: 'c1080000-0000-4000-8000-000000000701', request: 'c1080000-0000-4000-8000-000000000702' }
const context = (permissions: string[]) => ({ actorId: 'c1080000-0000-4000-8000-000000000901', tenantId: ids.tenant, companyId: ids.company, permissions, requestId: ids.request })
const record = { expectedSubcontractVersion: 0, description: 'Voucher', paidAmount: '100.0000', currencyCode: 'VND' }
const voidInput = { expectedVersion: 0, reason: 'Wrong voucher' }
describe('ProjectFinanceWriteService', () => {
  it.each(['PERMISSION_DENIED','INPUT_INVALID','RESOURCE_NOT_FOUND','VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','HISTORY_IMMUTABLE','PAYMENT_ALREADY_VOIDED'])('maps RPC error %s deterministically', async code => {
    const repository=new ProjectFinanceWriteRepository({rpc:vi.fn().mockResolvedValue({data:null,error:{message:code}})} as never)
    await expect(repository.recordPayment(context([]),ids.project,ids.subcontract,record as never,ids.key)).rejects.toMatchObject({code})
  })
  it.each(['cost.manage','cost.prepare','cost.publish_import','cost.correct'])("does not let %s substitute for cost.record_cash", async permission => {
    const repository = { recordPayment: vi.fn(), voidPayment: vi.fn() }; const service = new ProjectFinanceWriteService(repository as never)
    await expect(service.recordPayment(context([permission]) as never,ids.project,ids.subcontract,record,ids.key)).rejects.toMatchObject({ code:'PERMISSION_DENIED' })
    await expect(service.voidPayment(context([permission]) as never,ids.project,ids.subcontract,ids.payment,voidInput,ids.key)).rejects.toMatchObject({ code:'PERMISSION_DENIED' })
    expect(repository.recordPayment).not.toHaveBeenCalled(); expect(repository.voidPayment).not.toHaveBeenCalled()
  })
  it('routes record and void only for cost.record_cash', async () => {
    const repository={recordPayment:vi.fn(),voidPayment:vi.fn()}; const service=new ProjectFinanceWriteService(repository as never); const ctx=context(['cost.record_cash'])
    await service.recordPayment(ctx as never,ids.project,ids.subcontract,record,ids.key); await service.voidPayment(ctx as never,ids.project,ids.subcontract,ids.payment,voidInput,ids.key)
    expect(repository.recordPayment).toHaveBeenCalledWith(ctx,ids.project,ids.subcontract,record,ids.key); expect(repository.voidPayment).toHaveBeenCalledWith(ctx,ids.project,ids.subcontract,ids.payment,voidInput,ids.key)
  })
})
