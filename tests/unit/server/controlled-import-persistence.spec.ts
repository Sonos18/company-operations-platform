import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { canonicalizeManifest } from '../../../server/features/costs/imports/import-manifest'
import { createSupabaseControlledImportRepository } from '../../../server/features/costs/imports/controlled-import.repository'
import { createControlledImportService } from '../../../server/features/costs/imports/controlled-import.service'

const tenantId = 'c1000000-0000-4000-8000-000000000010'
const companyId = 'c1000000-0000-4000-8000-000000000020'
const actorId = 'c1000000-0000-4000-8000-000000000901'
const requestId = 'c1000000-0000-4000-8000-000000000099'
const runId = 'c1000000-0000-4000-8000-000000000060'
const idempotencyKey = 'c1000000-0000-4000-8000-000000000061'
const context = { tenantId, companyId, actorId, requestId, permissions: ['cost.source.read', 'cost.prepare'] as const }
const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/costs/controlled-import/manifest.synthetic.json'), 'utf8'))
const approvedManifestDigest = canonicalizeManifest(manifest).digest
const request = { runId, idempotencyKey, approvedManifestDigest, actualInputDigests: manifest.inputs.map((input: { sha256: string }) => input.sha256), manifest }
const row = {
  run_id: runId,
  source_ids: ['c1000000-0000-4000-8000-000000000050'],
  version_ids: ['c1000000-0000-4000-8000-000000000051', 'c1000000-0000-4000-8000-000000000052'],
  section_ids: ['c1000000-0000-4000-8000-000000000053', 'c1000000-0000-4000-8000-000000000054'],
  figure_ids: ['c1000000-0000-4000-8000-000000000055'],
  review_issue_ids: ['c1000000-0000-4000-8000-000000000056'],
  replayed: false,
}

describe('controlled-import persistence boundary', () => {
  it('keeps the frozen synthetic manifest digest stable across the database handoff', () => {
    expect(approvedManifestDigest).toBe('8651b0ef29773117d53b09403e9be2762df0709e2b623587938080610d1557f8')
  })

  it('validates and canonicalizes the frozen request before one repository write', async () => {
    const persist = vi.fn().mockResolvedValue({ runId, sourceIds: row.source_ids, versionIds: row.version_ids, sectionIds: row.section_ids, figureIds: row.figure_ids, reviewIssueIds: row.review_issue_ids, replayed: false })
    const service = createControlledImportService({ persist, get: vi.fn() }, manifest.adapter)

    await expect(service.persist(context, request)).resolves.toMatchObject({ runId, replayed: false })
    expect(persist).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledWith(companyId, expect.objectContaining({
      runId,
      idempotencyKey,
      approvedManifestDigest,
      manifest: expect.objectContaining({
        targetCompanyId: companyId,
        sections: expect.arrayContaining([
          expect.objectContaining({ id: 'opening-balance', locator: { kind: 'cell_range', sheetName: ' Nhật ký ', range: 'A1:B2' } }),
        ]),
        figures: [expect.objectContaining({ amount: '0', rawValueText: '0' })],
      }),
    }), expect.stringMatching(/^[a-f0-9]{64}$/), requestId)
  })

  it('refuses invalid input, untrusted company, and missing capabilities before persistence', async () => {
    const persist = vi.fn()
    const service = createControlledImportService({ persist, get: vi.fn() }, manifest.adapter)

    await expect(service.persist(context, { ...request, unexpected: true })).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    await expect(service.persist({ ...context, companyId: 'c1000000-0000-4000-8000-000000000021' }, request)).rejects.toMatchObject({ statusCode: 403, code: 'COMPANY_FORBIDDEN' })
    await expect(service.persist({ ...context, permissions: ['cost.source.read'] }, request)).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    await expect(createControlledImportService({ persist, get: vi.fn() }, { id: 'unreviewed', version: '1.0.0' }).persist(context, request)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    await expect(service.persist(context, { ...request, actualInputDigests: ['f'.repeat(64)] })).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(persist).not.toHaveBeenCalled()
  })

  it('uses exact RPC names and arguments and maps realistic snake-case results', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: row, error: null })
      .mockResolvedValueOnce({ data: { ...row, replayed: true }, error: null })
    const repository = createSupabaseControlledImportRepository({ rpc } as never)
    const normalizedRequest = { ...request, manifest: canonicalizeManifest(manifest).manifest }

    await expect(repository.persist(companyId, normalizedRequest, 'c'.repeat(64), requestId)).resolves.toEqual({
      runId, sourceIds: row.source_ids, versionIds: row.version_ids, sectionIds: row.section_ids,
      figureIds: row.figure_ids, reviewIssueIds: row.review_issue_ids, replayed: false,
    })
    await expect(repository.get(companyId, runId)).resolves.toMatchObject({ runId, replayed: true })
    expect(rpc.mock.calls).toEqual([
      ['c1_persist_controlled_import', { target_company_id: companyId, target_request: normalizedRequest, target_payload_digest: 'c'.repeat(64), target_request_id: requestId }],
      ['c1_get_controlled_import_result', { target_company_id: companyId, target_run_id: runId }],
    ])
  })

  it('rechecks source capabilities before reading a canonical result', async () => {
    const get = vi.fn().mockResolvedValue({ runId, sourceIds: [], versionIds: [], sectionIds: [], figureIds: [], reviewIssueIds: [], replayed: false })
    const service = createControlledImportService({ persist: vi.fn(), get }, manifest.adapter)

    await expect(service.get(context, runId)).resolves.toMatchObject({ runId })
    await expect(service.get({ ...context, permissions: ['cost.prepare'] }, runId)).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(companyId, runId)
  })

  it('maps durable payload conflicts without returning a cached result', async () => {
    const repository = createSupabaseControlledImportRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: 'IDEMPOTENCY_CONFLICT' } }) } as never)

    await expect(repository.persist(companyId, request, 'd'.repeat(64), requestId)).rejects.toMatchObject({ statusCode: 409, code: 'IDEMPOTENCY_CONFLICT' })
  })
})
