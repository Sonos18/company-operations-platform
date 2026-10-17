import { describe, expect, it, vi } from 'vitest'
import { createHttpMaterialFinanceRepository } from '../../../app/repositories/http/http-material-finance-repository'
import {
  materialFinanceEndpointManifest,
  type MaterialFinanceRepository,
} from '../../../shared/schemas/costs/material-finance'

const companyId = '25000000-0000-4000-8000-000000000001'
const projectId = '25000000-0000-4000-8000-000000000002'
const orderId = '25000000-0000-4000-8000-000000000003'
const contractId = '25000000-0000-4000-8000-000000000004'
const invoiceId = '25000000-0000-4000-8000-000000000005'
const requestId = '25000000-0000-4000-8000-000000000006'
const notificationId = '25000000-0000-4000-8000-000000000007'
const fileId = '25000000-0000-4000-8000-000000000008'
const installmentKey = '25000000-0000-4000-8000-000000000009'
const key = '25000000-0000-4000-8000-00000000000a'
const command = { idempotencyKey: key }
const commandResult = { resourceId: contractId, version: 1, replayed: false }

const contractInput = {
  documentation: 'contract',
  expectedOrderVersion: 1,
  contractNo: 'HD-01/2026',
  signedOn: '2026-10-10',
  subtotal: '100.0000',
  vatAmount: '10.0000',
  total: '110.0000',
  varianceReason: null,
  contractFileId: fileId,
  signedQuotationFileId: '25000000-0000-4000-8000-00000000000b',
  installments: [{ installmentKey, name: 'Thanh toán', amount: '110.0000', dueOn: '2026-11-10', isAdvance: false }],
}
const totals = {
  committed: '0.0000', paid: '0.0000', pending: '0.0000', remaining: '0.0000',
  overdue: '0.0000', invoiced: '0.0000', draftInvoiced: '0.0000', paidWithoutInvoice: '0.0000',
}
const emptyInbox = {
  awaitingContract: [], dueInstallments: [], returnedRequests: [], pendingApproval: [], approvedAwaitingPayment: [],
}

function response(data: unknown) {
  return {
    request: vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(data)),
  }
}

function repositoryFor(data: unknown) {
  const client = response(data)
  return { client, repository: createHttpMaterialFinanceRepository({ companyId, client: client as never }) }
}

const routeParams: Record<string, string> = {
  companyId, projectId, orderId, contractId, invoiceId, requestId, notificationId,
}

function expand(path: string) {
  return path.replace(/:([A-Za-z]+)/gu, (_, name: string) => routeParams[name] ?? ':' + name)
}

type EndpointName = keyof typeof materialFinanceEndpointManifest
const calls: Record<EndpointName, { data: unknown, call(repository: MaterialFinanceRepository): Promise<unknown> }> = {
  readContract: { data: null, call: repository => repository.readContract(projectId, orderId) },
  recordContract: { data: commandResult, call: repository => repository.recordContract(projectId, orderId, contractInput, command) },
  amendContract: {
    data: commandResult,
    call: repository => repository.amendContract(projectId, contractId, {
      expectedVersion: 1, amendmentFileId: fileId, reason: 'Phụ lục giá',
      subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000', varianceReason: null,
      installments: contractInput.installments,
    }, command),
  },
  listInvoices: { data: [], call: repository => repository.listInvoices(projectId, contractId) },
  recordInvoice: {
    data: commandResult,
    call: repository => repository.recordInvoice(projectId, contractId, {
      invoiceSymbol: '1C26TAA', invoiceNo: '0000123', issuedOn: '2026-10-11',
      subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000', fileId, lines: [],
    }, command),
  },
  voidInvoice: { data: commandResult, call: repository => repository.voidInvoice(projectId, invoiceId, { expectedVersion: 1, reason: 'Sai số' }, command) },
  officializeInvoice: { data: commandResult, call: repository => repository.officializeInvoice(projectId, invoiceId, { expectedVersion: 1, officialFileId: fileId }, command) },
  listPaymentRequests: { data: [], call: repository => repository.listPaymentRequests(projectId, contractId) },
  createPaymentRequest: {
    data: commandResult,
    call: repository => repository.createPaymentRequest(projectId, contractId, { installmentKey, amount: '10.0000', invoiceIds: [], note: null }, command),
  },
  resubmitPaymentRequest: {
    data: commandResult,
    call: repository => repository.resubmitPaymentRequest(projectId, requestId, { expectedVersion: 2, amount: '10.0000', invoiceIds: [invoiceId], note: null }, command),
  },
  cancelPaymentRequest: { data: commandResult, call: repository => repository.cancelPaymentRequest(projectId, requestId, { expectedVersion: 2, reason: 'Trùng' }, command) },
  decidePaymentRequest: { data: commandResult, call: repository => repository.decidePaymentRequest(projectId, requestId, { expectedVersion: 2, decision: 'approve' }, command) },
  recordPayment: {
    data: commandResult,
    call: repository => repository.recordPayment(projectId, requestId, { expectedVersion: 3, paidOn: '2026-10-15', method: 'bank_transfer', bankReference: 'UNC-01', proofFileId: fileId }, command),
  },
  projectSummary: { data: { projectId, currencyCode: 'VND', totals, contracts: [] }, call: repository => repository.projectSummary(projectId) },
  inbox: { data: emptyInbox, call: repository => repository.inbox() },
  suppliers: { data: [], call: repository => repository.suppliers() },
  listNotifications: { data: { items: [], nextCursor: null }, call: repository => repository.listNotifications() },
  readNotification: { data: commandResult, call: repository => repository.readNotification(notificationId, command) },
}

describe('material finance HTTP repository', () => {
  it.each(Object.keys(materialFinanceEndpointManifest) as EndpointName[])('calls %s through its manifest method and path', async name => {
    const endpoint = materialFinanceEndpointManifest[name]
    const { client, repository } = repositoryFor(calls[name].data)
    await calls[name].call(repository)
    expect(client.request).toHaveBeenCalledTimes(1)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      method: endpoint.method,
      url: expand(endpoint.path),
    }))
    const request = client.request.mock.calls[0]![0] as { idempotencyKey?: string }
    expect(request.idempotencyKey).toBe(endpoint.method === 'GET' ? undefined : key)
  })

  it('posts a contract to the order contract route with the idempotency key and parsed body', async () => {
    const { client, repository } = repositoryFor(commandResult)
    await expect(repository.recordContract(projectId, orderId, contractInput, command)).resolves.toEqual(commandResult)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: '/api/companies/' + companyId + '/projects/' + projectId + '/material-procurement/orders/' + orderId + '/contract',
      body: contractInput,
      idempotencyKey: key,
    }))
  })

  it('officializes an invoice with POST to the official route, the idempotency key and the parsed body', async () => {
    const { client, repository } = repositoryFor(commandResult)
    await expect(repository.officializeInvoice(projectId, invoiceId, { expectedVersion: 1, officialFileId: fileId }, command)).resolves.toEqual(commandResult)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: '/api/companies/' + companyId + '/projects/' + projectId + '/material-procurement/invoices/' + invoiceId + '/official',
      body: { expectedVersion: 1, officialFileId: fileId },
      idempotencyKey: key,
    }))
  })

  it('resubmits payment requests with PATCH', async () => {
    const { client, repository } = repositoryFor(commandResult)
    await repository.resubmitPaymentRequest(projectId, requestId, { expectedVersion: 2, amount: '10.0000', invoiceIds: [], note: '  ' }, command)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'PATCH',
      url: '/api/companies/' + companyId + '/projects/' + projectId + '/material-procurement/payment-requests/' + requestId,
      body: { expectedVersion: 2, amount: '10.0000', invoiceIds: [], note: null },
    }))
  })

  it('sends the inbox project filter only when provided', async () => {
    const all = repositoryFor(emptyInbox)
    await all.repository.inbox()
    expect(all.client.request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/companies/' + companyId + '/material-finance/inbox',
    }))

    const scoped = repositoryFor(emptyInbox)
    await scoped.repository.inbox(projectId)
    expect(scoped.client.request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/companies/' + companyId + '/material-finance/inbox?projectId=' + projectId,
    }))
    await expect(scoped.repository.inbox('../other')).rejects.toThrow()
  })

  it('pages notifications with an encoded cursor and marks one read with an empty command body', async () => {
    const cursor = '323032362d31302d31355431303a30303a30302e3030303030305a7c3235303030303030'
    const page = repositoryFor({ items: [], nextCursor: null })
    await page.repository.listNotifications(cursor)
    expect(page.client.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: '/api/companies/' + companyId + '/notifications?cursor=' + encodeURIComponent(cursor),
    }))

    const read = repositoryFor(commandResult)
    await read.repository.readNotification(notificationId, command)
    expect(read.client.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: '/api/companies/' + companyId + '/notifications/' + notificationId + '/read',
      body: {},
      idempotencyKey: key,
    }))
  })

  it('accepts a missing contract as null', async () => {
    const { repository } = repositoryFor(null)
    await expect(repository.readContract(projectId, orderId)).resolves.toBeNull()
  })

  it('rejects invalid input and idempotency keys before sending', async () => {
    const { client, repository } = repositoryFor(commandResult)
    await expect(repository.recordContract(projectId, orderId, { ...contractInput, total: '111.0000' }, command)).rejects.toThrow()
    await expect(repository.recordContract(projectId, orderId, contractInput, { idempotencyKey: 'not-a-uuid' })).rejects.toThrow()
    await expect(repository.readContract('../other-project', orderId)).rejects.toThrow()
    expect(client.request).not.toHaveBeenCalled()
  })

  it('requires an active company', async () => {
    const client = response(commandResult)
    const repository = createHttpMaterialFinanceRepository({ companyId: () => null, client: client as never })
    await expect(repository.suppliers()).rejects.toThrow('ACTIVE_COMPANY_REQUIRED')
    await expect(repository.readContract(projectId, orderId)).rejects.toThrow('ACTIVE_COMPANY_REQUIRED')
    expect(client.request).not.toHaveBeenCalled()
  })
})
