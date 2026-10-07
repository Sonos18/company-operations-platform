import { describe, expect, it, vi } from 'vitest'
import { createHttpCostWorkflowRepository } from '../../../app/repositories/http/http-cost-workflow-repository'
import { createAuthenticatedHttpClient } from '../../../app/repositories/http/authenticated-http-client'

const company = 'c1f50000-0000-4000-8000-000000000001'
const project = 'c1f50000-0000-4000-8000-000000000002'
const file = 'c1f50000-0000-4000-8000-000000000003'
const item = { id: file, version: 1, originalFilename: 'Synthetic.pdf', mimeType: 'application/pdf', sizeBytes: 1, sha256: 'a'.repeat(64), finalizedAt: '2026-10-07T00:00:00Z', kind: 'quotation' }
function fixture(data: unknown = [item]) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(data), { status: 200 }))
  const companyId = vi.fn(() => company)
  const repo = createHttpCostWorkflowRepository({ companyId, client: createAuthenticatedHttpClient({ getAccessToken: () => 'synthetic-session', fetch }) })
  return { fetch, companyId, repo }
}
describe('authenticated recovery client', () => {
  it.each([{ requestId: null, requestVersion: null }, { requestId: file, requestVersion: 0 }, { requestId: file, requestVersion: 2 }])('serializes only the current paired request identity %j', async input => {
    const f = fixture()
    expect(await f.repo.listRecoverableQuotations(project, input)).toEqual([item])
    const suffix = input.requestId === null ? '' : '?requestId=' + file + '&requestVersion=' + input.requestVersion
    expect(f.fetch).toHaveBeenCalledWith('/api/companies/' + company + '/projects/' + project + '/cost-workflow/evidence/recoverable-quotations' + suffix, { method: 'GET', headers: { Authorization: 'Bearer synthetic-session' } })
    expect(f.companyId).toHaveBeenCalledOnce()
  })
  it.each([{ requestId: null, requestVersion: 2 }, { requestId: file, requestVersion: null }, { requestId: file, requestVersion: -1 }, { requestId: file, requestVersion: Number.MAX_SAFE_INTEGER + 1 }, { requestId: null, requestVersion: null, fileId: file }])('rejects invalid input before fetch %j', async input => {
    const f = fixture()
    await expect(f.repo.listRecoverableQuotations(project, input as never)).rejects.toThrow()
    expect(f.fetch).not.toHaveBeenCalled()
  })
  it.each([[item, item], Array.from({ length: 21 }, () => item), [{ ...item, objectPath: 'private' }], [{ ...item, raw: {} }], [{ ...item, url: 'https://example.invalid' }]].map(data => [data]))('rejects invalid or sensitive response batches', async data => {
    const f = fixture(data)
    await expect(f.repo.listRecoverableQuotations(project, { requestId: null, requestVersion: null })).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })
})
