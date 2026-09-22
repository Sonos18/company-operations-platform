import { describe, expect, it, vi } from 'vitest'
import { CostEvidenceService } from '../../../server/features/costs/evidence/cost-evidence.service'
import { CostEvidenceRepository } from '../../../server/features/costs/evidence/cost-evidence.repository'

const ids = { tenant: 'c1070000-0000-4000-8000-000000000010', company: 'c1070000-0000-4000-8000-000000000020', project: 'c1070000-0000-4000-8000-000000000101', cost: 'c1070000-0000-4000-8000-000000000201', file: 'c1070000-0000-4000-8000-000000000401', key: 'c1070000-0000-4000-8000-000000000701', request: 'c1070000-0000-4000-8000-000000000702' }
const context = (permissions: string[]) => ({ actorId: 'c1070000-0000-4000-8000-000000000901', tenantId: ids.tenant, companyId: ids.company, permissions, requestId: ids.request, db: {} })
const intent = { originalFilename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 8, sha256: 'a'.repeat(64) }
const finalize = { expectedVersion: 0 }
const link = { evidenceFileId: ids.file, evidenceKind: 'invoice' }

describe('CostEvidenceService', () => {
  it('returns the authenticated immutable upload target without minting a signed token', async () => {
    const storageFrom = vi.fn()
    const client = { rpc: vi.fn().mockResolvedValue({ data: { evidenceFileId: ids.file, version: 0, bucketId: 'c1-accounting-evidence', objectPath: `${ids.tenant}/${ids.company}/${ids.project}/${ids.file}`, expiresAt: '2026-09-22T00:15:00.000Z', replayed: false }, error: null }), storage: { from: storageFrom } }
    await expect(new CostEvidenceRepository(client as never).createIntent(context([]), ids.project, intent as never, ids.key)).resolves.not.toHaveProperty('signedUploadToken')
    expect(storageFrom).not.toHaveBeenCalled()
  })

  it('verifies downloaded bytes before finalize and issues read URLs for exactly 60 seconds', async () => {
    const blob = new Blob([new TextEncoder().encode('%PDF-1.7\n')], { type: 'application/pdf' })
    const query = (data: unknown) => { const result = { data, error: null }; const value = { select: () => value, eq: () => value, order: () => value, maybeSingle: async () => result, then: (resolve: (result: unknown) => unknown) => Promise.resolve(result).then(resolve) }; return value }
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.test/evidence' }, error: null })
    const rpc = vi.fn().mockImplementation(async (name: string) => name === 'c1_get_cost_evidence_read_target'
      ? { data: { bucketId: 'c1-accounting-evidence', objectPath: `${ids.tenant}/${ids.company}/${ids.project}/${ids.file}`, originalFilename: 'invoice.pdf' }, error: null }
      : { data: { id: ids.file, status: 'finalized', originalFilename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 9, sha256: '0716f9264c9fe19f5d7455276107f3ddcc1d3497f63d60689a73558ae8a1bf5e', version: 1, finalizedAt: '2026-09-22T00:01:00.000Z', replayed: false }, error: null })
    const client = {
      rpc,
      from: vi.fn().mockReturnValue(query({ bucket_id: 'c1-accounting-evidence', object_path: `${ids.tenant}/${ids.company}/${ids.project}/${ids.file}`, declared_mime_type: 'application/pdf', declared_size_bytes: 9, declared_sha256: '0716f9264c9fe19f5d7455276107f3ddcc1d3497f63d60689a73558ae8a1bf5e' })),
      storage: { from: vi.fn().mockReturnValue({ download: vi.fn().mockResolvedValue({ data: blob, error: null }), createSignedUrl }) },
    }
    const repository = new CostEvidenceRepository(client as never)
    await repository.finalize(context([]), ids.file, finalize, ids.key)
    expect(rpc).toHaveBeenCalledWith('c1_finalize_cost_evidence', expect.objectContaining({ target_input: expect.objectContaining({ sizeBytes: 9, sha256: '0716f9264c9fe19f5d7455276107f3ddcc1d3497f63d60689a73558ae8a1bf5e' }) }))
    await repository.createReadUrl(context([]), ids.file, { disposition: 'inline' })
    expect(rpc).toHaveBeenCalledWith('c1_get_cost_evidence_read_target', expect.objectContaining({ target_id: ids.file }))
    expect(createSignedUrl).toHaveBeenCalledWith(`${ids.tenant}/${ids.company}/${ids.project}/${ids.file}`, 60, { download: false })
  })

  it('lets a finalize retry reach the receipt after finalized metadata becomes hidden', async () => {
    const query = () => { const result = { data: null, error: null }; const value = { select: () => value, eq: () => value, maybeSingle: async () => result, then: (resolve: (result: unknown) => unknown) => Promise.resolve(result).then(resolve) }; return value }
    const download = vi.fn()
    const replay = { id: ids.file, status: 'finalized', originalFilename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 9, sha256: 'a'.repeat(64), version: 1, finalizedAt: '2026-09-22T00:01:00.000Z', replayed: true }
    const client = { rpc: vi.fn().mockResolvedValue({ data: replay, error: null }), from: vi.fn().mockReturnValue(query()), storage: { from: vi.fn().mockReturnValue({ download }) } }
    await expect(new CostEvidenceRepository(client as never).finalize(context([]), ids.file, finalize, ids.key)).resolves.toEqual(replay)
    expect(client.rpc).toHaveBeenCalledWith('c1_finalize_cost_evidence', expect.objectContaining({ target_input: { expectedVersion: 0 } }))
    expect(download).not.toHaveBeenCalled()
  })

  it.each([
    { declared_size_bytes: 10, declared_sha256: '0716f9264c9fe19f5d7455276107f3ddcc1d3497f63d60689a73558ae8a1bf5e' },
    { declared_size_bytes: 9, declared_sha256: '0'.repeat(64) },
  ])('rejects a signed-format object when declared size or hash differs: %o', async identity => {
    const blob = new Blob([new TextEncoder().encode('%PDF-1.7\n')], { type: 'application/pdf' })
    const result = { data: { bucket_id: 'c1-accounting-evidence', object_path: `${ids.tenant}/${ids.company}/${ids.project}/${ids.file}`, declared_mime_type: 'application/pdf', ...identity }, error: null }
    const query = () => { const value = { select: () => value, eq: () => value, maybeSingle: async () => result }; return value }
    const rpc = vi.fn()
    const client = { rpc, from: vi.fn().mockReturnValue(query()), storage: { from: vi.fn().mockReturnValue({ download: vi.fn().mockResolvedValue({ data: blob, error: null }) }) } }
    await expect(new CostEvidenceRepository(client as never).finalize(context([]), ids.file, finalize, ids.key)).rejects.toMatchObject({ code: 'EVIDENCE_UPLOAD_MISMATCH' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('uses one guarded raw-read target even when a file has multiple links', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.test/evidence' }, error: null })
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: { bucketId: 'c1-accounting-evidence', objectPath: `${ids.tenant}/${ids.company}/${ids.project}/${ids.file}`, originalFilename: 'invoice.pdf' }, error: null }),
      from: vi.fn(() => { throw new Error('raw reads must not query metadata tables') }),
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    }
    await expect(new CostEvidenceRepository(client as never).createReadUrl(context([]), ids.file, { disposition: 'attachment' })).resolves.toMatchObject({ url: 'https://example.test/evidence' })
    expect(client.from).not.toHaveBeenCalled()
  })

  it.each(['cost.manage', 'cost.publish_import', 'cost.correct', 'cost.record_cash'])("does not let %s substitute for cost.prepare", async permission => {
    const repository = { createIntent: vi.fn(), finalize: vi.fn(), linkCost: vi.fn() }
    const service = new CostEvidenceService(repository as never)
    await expect(service.createIntent(context([permission]) as never, ids.project, intent, ids.key)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await expect(service.finalize(context([permission]) as never, ids.file, finalize, ids.key)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await expect(service.linkCost(context([permission]) as never, ids.cost, link, ids.key)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(repository.createIntent).not.toHaveBeenCalled(); expect(repository.finalize).not.toHaveBeenCalled(); expect(repository.linkCost).not.toHaveBeenCalled()
  })

  it.each(['cost.read', 'cost.source.read'])("does not let %s substitute for cost.file.read", async permission => {
    const repository = { createReadUrl: vi.fn() }
    await expect(new CostEvidenceService(repository as never).createReadUrl(context([permission]) as never, ids.file, { disposition: 'inline' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(repository.createReadUrl).not.toHaveBeenCalled()
  })

  it('requires linked-resource read permission in addition to cost.file.read', async () => {
    const repository = { createReadUrl: vi.fn() }
    await expect(new CostEvidenceService(repository as never).createReadUrl(context(['cost.file.read']) as never, ids.file, { disposition: 'inline' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(repository.createReadUrl).not.toHaveBeenCalled()
  })

  it('routes positive prepare, metadata, and raw-file capabilities independently', async () => {
    const repository = { createIntent: vi.fn(), finalize: vi.fn(), linkCost: vi.fn(), listCostEvidence: vi.fn(), createReadUrl: vi.fn() }
    const service = new CostEvidenceService(repository as never)
    await service.createIntent(context(['cost.prepare']) as never, ids.project, intent, ids.key)
    await service.finalize(context(['cost.prepare']) as never, ids.file, finalize, ids.key)
    await service.linkCost(context(['cost.prepare']) as never, ids.cost, link, ids.key)
    await service.listCostEvidence(context(['cost.source.read']) as never, ids.cost)
    await service.createReadUrl(context(['cost.read', 'cost.file.read']) as never, ids.file, { disposition: 'attachment' })
    expect(repository.createIntent).toHaveBeenCalledOnce(); expect(repository.finalize).toHaveBeenCalledOnce(); expect(repository.linkCost).toHaveBeenCalledOnce(); expect(repository.listCostEvidence).toHaveBeenCalledOnce(); expect(repository.createReadUrl).toHaveBeenCalledOnce()
  })
})
