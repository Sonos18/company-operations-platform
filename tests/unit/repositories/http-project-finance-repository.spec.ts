import { describe, expect, it, vi } from 'vitest'
import { createHttpProjectFinanceRepository } from '../../../app/repositories/http/http-project-finance-repository'

const companyId = 'c1050000-0000-4000-8000-000000000020'

const responseClient = (response: unknown) => ({ request: vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(response)) })

describe('HTTP Project Finance repository', () => {
  it('serializes the typed directory query and captures the current company per request', async () => {
    const currentCompany = vi.fn().mockReturnValue(companyId)
    const client = responseClient({ schemaVersion: 1, projects: [], nextCursor: null })
    const repository = createHttpProjectFinanceRepository({ companyId: currentCompany, client: client as never })

    await repository.listProjects({ pageSize: 50 })

    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ url: `/api/companies/${companyId}/project-finances?pageSize=50`, method: 'GET' }))
    expect(currentCompany).toHaveBeenCalledOnce()
  })

  it('rejects an inactive company before making a request', async () => {
    const client = responseClient({ schemaVersion: 1, projects: [], nextCursor: null })
    const repository = createHttpProjectFinanceRepository({ companyId: () => '', client: client as never })

    expect(() => repository.listProjects()).toThrow('ACTIVE_COMPANY_REQUIRED')
    expect(client.request).not.toHaveBeenCalled()
  })

  it('keeps new responses strict', async () => {
    const client = responseClient({ schemaVersion: 1, projects: [], nextCursor: null, workStatus: 'unknown' })
    const repository = createHttpProjectFinanceRepository({ companyId, client: client as never })

    await expect(repository.listProjects()).rejects.toThrow()
  })

  it('records subcontract payment with idempotency key and valid payload', async () => {
    const projectId = 'c1010000-0000-4000-8000-000000000001'
    const subcontractId = 'c1020000-0000-4000-8000-000000000002'
    const paymentId = 'c1030000-0000-4000-8000-000000000003'
    const client = responseClient({ paymentId, version: 0, status: 'recorded', replayed: false })
    const repository = createHttpProjectFinanceRepository({
      companyId,
      client: client as never,
    })

    const input = { expectedSubcontractVersion: 0, description: 'Payment voucher #1', paidAmount: '1000000.0000', currencyCode: 'VND' }
    const idempotencyKey = 'c1040000-0000-4000-8000-000000000701'
    const result = await repository.recordSubcontractPayment(projectId, subcontractId, input, { idempotencyKey })
    await repository.recordSubcontractPayment(projectId, subcontractId, input, { idempotencyKey })

    expect(result).toEqual({ paymentId, version: 0, status: 'recorded', replayed: false })
    expect(client.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: `/api/companies/${companyId}/projects/${projectId}/subcontracts/${subcontractId}/payments`,
      method: 'POST',
      body: input,
      idempotencyKey,
    }))
    expect(client.request).toHaveBeenNthCalledWith(2, expect.objectContaining({ body: input, idempotencyKey }))
  })

  it('voids subcontract payment with reason and version', async () => {
    const projectId = 'c1010000-0000-4000-8000-000000000001'
    const subcontractId = 'c1020000-0000-4000-8000-000000000002'
    const paymentId = 'c1030000-0000-4000-8000-000000000003'
    const client = responseClient({ paymentId, version: 1, status: 'voided', replayed: false })
    const repository = createHttpProjectFinanceRepository({
      companyId,
      client: client as never,
    })

    const result = await repository.voidSubcontractPayment(projectId, subcontractId, paymentId, {
      expectedVersion: 0,
      reason: 'Wrong amount entered',
    }, { idempotencyKey: 'c1040000-0000-4000-8000-000000000702' })

    expect(result).toEqual({ paymentId, version: 1, status: 'voided', replayed: false })
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      url: `/api/companies/${companyId}/projects/${projectId}/subcontracts/${subcontractId}/payments/${paymentId}/void`,
      method: 'POST',
      idempotencyKey: 'c1040000-0000-4000-8000-000000000702',
    }))
  })
})
