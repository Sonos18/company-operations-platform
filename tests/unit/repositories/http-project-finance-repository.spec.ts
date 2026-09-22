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
})
