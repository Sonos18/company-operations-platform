import { describe, expect, it, vi } from 'vitest'
import type { PermissionCode } from '../../../shared/constants/permissions'
import {
  MaterialPaymentService,
  type MaterialPaymentDataRepository,
} from '../../../server/features/costs/material-finance/payment-service'
import { SupabaseMaterialPaymentRepository } from '../../../server/features/costs/material-finance/payment-repository'
import type { MaterialFinanceContext } from '../../../server/features/costs/material-finance/service'

const ids = {
  project: '30000000-0000-4000-8000-000000000001',
  contract: '30000000-0000-4000-8000-000000000002',
  invoice: '30000000-0000-4000-8000-000000000003',
  request: '30000000-0000-4000-8000-000000000004',
  key: '30000000-0000-4000-8000-000000000005',
  file: '30000000-0000-4000-8000-000000000006',
  line: '30000000-0000-4000-8000-000000000007',
  installment: '30000000-0000-4000-8000-000000000008',
  user: '30000000-0000-4000-8000-000000000009',
}

const ctx = (permissions: PermissionCode[]): MaterialFinanceContext => ({
  actorId: ids.user, tenantId: ids.user, companyId: ids.user, requestId: ids.key, permissions,
})

const ack = { resourceId: ids.request, version: 1, replayed: false }

function repo(overrides: Partial<MaterialPaymentDataRepository> = {}): MaterialPaymentDataRepository {
  return {
    listInvoices: vi.fn(async () => []),
    recordInvoice: vi.fn(async () => ack),
    voidInvoice: vi.fn(async () => ack),
    listPaymentRequests: vi.fn(async () => []),
    createPaymentRequest: vi.fn(async () => ack),
    resubmitPaymentRequest: vi.fn(async () => ack),
    cancelPaymentRequest: vi.fn(async () => ack),
    decidePaymentRequest: vi.fn(async () => ack),
    recordPayment: vi.fn(async () => ack),
    ...overrides,
  }
}

const inputs = {
  recordInvoice: {
    invoiceSymbol: '1C26TAA', invoiceNo: '0000001', issuedOn: '2026-10-10',
    subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000', fileId: ids.file,
    lines: [{ proposalLineId: ids.line, invoiceMaterialName: 'Thép D10' }],
  },
  voidInvoice: { expectedVersion: 1, reason: 'Sai số hóa đơn' },
  createPaymentRequest: { installmentKey: ids.installment, amount: '33.0000', invoiceIds: [], note: null },
  resubmitPaymentRequest: { expectedVersion: 2, amount: '20.0000', invoiceIds: [ids.invoice], note: 'Gửi lại' },
  cancelPaymentRequest: { expectedVersion: 1, reason: 'Không chi nữa' },
  decidePaymentRequest: { expectedVersion: 1, decision: 'approve' },
  recordPayment: { expectedVersion: 2, paidOn: '2026-10-12', method: 'bank_transfer', bankReference: 'UNC-001', proofFileId: ids.file },
} as const

type CommandMethod = keyof typeof inputs

const targets: Record<CommandMethod, string> = {
  recordInvoice: ids.contract,
  voidInvoice: ids.invoice,
  createPaymentRequest: ids.contract,
  resubmitPaymentRequest: ids.request,
  cancelPaymentRequest: ids.request,
  decidePaymentRequest: ids.request,
  recordPayment: ids.request,
}

function callWith(service: MaterialPaymentService, method: CommandMethod, context: MaterialFinanceContext) {
  return service[method](context, ids.project, targets[method], inputs[method], ids.key)
}

describe('material payment service', () => {
  it.each([
    ['recordInvoice', 'material.contract.record'],
    ['voidInvoice', 'material.contract.record'],
    ['createPaymentRequest', 'material.payment.request'],
    ['resubmitPaymentRequest', 'material.payment.request'],
    ['cancelPaymentRequest', 'material.payment.request'],
    ['decidePaymentRequest', 'material.payment.approve'],
    ['recordPayment', 'material.payment.execute'],
  ] as const)('%s requires %s and material.read', async (method, permission) => {
    const repository = repo()
    const service = new MaterialPaymentService(repository)
    await expect(callWith(service, method, ctx(['material.read']))).rejects.toMatchObject({ statusCode: 403 })
    await expect(callWith(service, method, ctx([permission]))).rejects.toMatchObject({ statusCode: 403 })
    expect(repository[method]).not.toHaveBeenCalled()
    await expect(callWith(service, method, ctx(['material.read', permission]))).resolves.toMatchObject({ replayed: false })
    expect(repository[method]).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: ids.user }), ids.project, targets[method], expect.any(Object), ids.key,
    )
  })

  it('lets an approver reach cancel (the RPC decides by request state) and keeps other roles out', async () => {
    const repository = repo()
    const service = new MaterialPaymentService(repository)
    await expect(callWith(service, 'cancelPaymentRequest', ctx(['material.read', 'material.payment.execute'])))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(callWith(service, 'cancelPaymentRequest', ctx(['material.payment.approve'])))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(repository.cancelPaymentRequest).not.toHaveBeenCalled()
    await expect(callWith(service, 'cancelPaymentRequest', ctx(['material.read', 'material.payment.approve'])))
      .resolves.toMatchObject({ replayed: false })
  })

  it('rejects a return decision without reason as 400', async () => {
    const service = new MaterialPaymentService(repo())
    await expect(service.decidePaymentRequest(ctx(['material.read', 'material.payment.approve']), ids.project, ids.request,
      { expectedVersion: 1, decision: 'return' }, ids.key)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an unbalanced invoice and an invalid idempotency key before calling the repository', async () => {
    const repository = repo()
    const service = new MaterialPaymentService(repository)
    const recorder = ctx(['material.read', 'material.contract.record'])
    await expect(service.recordInvoice(recorder, ids.project, ids.contract,
      { ...inputs.recordInvoice, total: '111.0000' }, ids.key)).rejects.toMatchObject({ statusCode: 400 })
    await expect(service.recordInvoice(recorder, ids.project, ids.contract, inputs.recordInvoice, 'not-a-key'))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(repository.recordInvoice).not.toHaveBeenCalled()
  })

  it('lists invoices and requests for finance readers only', async () => {
    const service = new MaterialPaymentService(repo())
    await expect(service.listPaymentRequests(ctx(['material.read', 'material.order.manage']), ids.project, ids.contract))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(service.listPaymentRequests(ctx(['material.read', 'material.payment.approve']), ids.project, ids.contract))
      .resolves.toEqual([])
    await expect(service.listInvoices(ctx(['material.read', 'material.order.manage']), ids.project, ids.contract))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(service.listInvoices(ctx(['material.read', 'material.finance.read']), ids.project, ids.contract))
      .resolves.toEqual([])
  })
})

describe('material payment method', () => {
  const payer = ctx(['material.read', 'material.payment.execute'])
  const cash = { expectedVersion: 2, paidOn: '2026-10-12', method: 'cash', bankReference: '  ', proofFileId: ids.file }

  it('normalizes a blank cash reference to null before calling the repository', async () => {
    const repository = repo()
    await new MaterialPaymentService(repository).recordPayment(payer, ids.project, ids.request, cash, ids.key)
    expect(repository.recordPayment).toHaveBeenCalledWith(
      expect.anything(), ids.project, ids.request, expect.objectContaining({ method: 'cash', bankReference: null }), ids.key,
    )
  })

  it('rejects a cash payment that carries a reference as 400', async () => {
    const repository = repo()
    await expect(new MaterialPaymentService(repository).recordPayment(payer, ids.project, ids.request, { ...cash, bankReference: 'UNC-1' }, ids.key))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(repository.recordPayment).not.toHaveBeenCalled()
  })

  it('omits the default method key for a bank transfer so old receipts hash the same', async () => {
    const client = { rpc: vi.fn(async () => ({ data: ack, error: null })) }
    const input = { expectedVersion: 2, paidOn: '2026-10-12', method: 'bank_transfer' as const, bankReference: 'UNC-1', proofFileId: ids.file }
    await new SupabaseMaterialPaymentRepository(client as never).recordPayment(payer, ids.project, ids.request, input, ids.key)
    const sent = (client.rpc.mock.calls[0] as unknown as [string, { target_input: object }])[1].target_input
    expect(sent).toEqual({ expectedVersion: 2, paidOn: '2026-10-12', bankReference: 'UNC-1', proofFileId: ids.file })
    expect(sent).not.toHaveProperty('method')
  })

  it('accepts a service body without the method key as a bank transfer', async () => {
    const repository = repo()
    await new MaterialPaymentService(repository).recordPayment(
      payer, ids.project, ids.request, { expectedVersion: 2, paidOn: '2026-10-12', bankReference: 'UNC-1', proofFileId: ids.file }, ids.key,
    )
    expect(repository.recordPayment).toHaveBeenCalledWith(
      expect.anything(), ids.project, ids.request, expect.objectContaining({ method: 'bank_transfer', bankReference: 'UNC-1' }), ids.key,
    )
  })

  it('forwards cash and a null reference to the RPC', async () => {
    const client = { rpc: vi.fn(async () => ({ data: ack, error: null })) }
    const input = { expectedVersion: 2, paidOn: '2026-10-12', method: 'cash' as const, bankReference: null, proofFileId: ids.file }
    await new SupabaseMaterialPaymentRepository(client as never).recordPayment(payer, ids.project, ids.request, input, ids.key)
    expect(client.rpc).toHaveBeenCalledWith('c1_material_record_payment', expect.objectContaining({ target_id: ids.request, target_input: input }))
  })

  it('maps CASH_PAYMENT_NOT_ALLOWED to a dedicated 409', async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { message: 'CASH_PAYMENT_NOT_ALLOWED' } })) }
    const input = { expectedVersion: 2, paidOn: '2026-10-12', method: 'cash' as const, bankReference: null, proofFileId: ids.file }
    await expect(new SupabaseMaterialPaymentRepository(client as never).recordPayment(payer, ids.project, ids.request, input, ids.key))
      .rejects.toMatchObject({ statusCode: 409, code: 'CASH_PAYMENT_NOT_ALLOWED', message: expect.stringContaining('tiền mặt') })
  })
})
