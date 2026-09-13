import { describe, expect, it, vi } from 'vitest'
import { createHttpAccountingSourceRepository } from '../../../app/repositories/http/http-accounting-source-repository'

const companyId = 'c1000000-0000-4000-8000-000000000020'
const sourceId = 'c1000000-0000-4000-8000-000000000050'
const response = { id: sourceId, code: 'SRC-01', title: 'Source', sourceSystem: 'spreadsheet', suggestedProjectId: null, isArchived: false, version: 0, createdAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z' }

describe('C1 accounting source HTTP repository', () => {
  it('uses the active company and strict source schemas without a mock fallback', async () => {
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse([response]))
    const repository = createHttpAccountingSourceRepository({ companyId: () => companyId, client: { request } as never })
    await expect(repository.list()).resolves.toEqual([response])
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: `/api/companies/${companyId}/accounting-sources`, method: 'GET' }))
  })
})
