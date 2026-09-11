import { describe, expect, it, vi } from 'vitest'
import { createHttpProjectRegisterRepository } from '../../../app/repositories/http/http-project-register-repository'

const companyId = 'c1000000-0000-4000-8000-000000000020'
const projectId = 'c1000000-0000-4000-8000-000000000030'

describe('C1 HTTP master-data repositories', () => {
  it('uses the current company and strict project endpoints', async () => {
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse([{
      id: projectId, code: 'P-01', name: 'Project', origin: 'manual', operationalState: 'active', clientDisplayName: null, locationText: null, version: 0, createdAt: '2026-09-11T00:00:00.000Z', updatedAt: '2026-09-11T00:00:00.000Z',
    }]))
    const repository = createHttpProjectRegisterRepository({ companyId: () => companyId, client: { request } as never })
    await expect(repository.list()).resolves.toMatchObject([{ id: projectId }])
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: `/api/companies/${companyId}/projects`, method: 'GET' }))
  })
})
