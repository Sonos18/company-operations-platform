import { describe, expect, it, vi } from 'vitest'
import { CostEvidenceService } from '../../../server/features/costs/evidence/cost-evidence.service'
import { CostEvidenceRepository } from '../../../server/features/costs/evidence/cost-evidence.repository'

const ids = { tenant: 'c1070000-0000-4000-8000-000000000010', company: 'c1070000-0000-4000-8000-000000000020', project: 'c1070000-0000-4000-8000-000000000101', cost: 'c1070000-0000-4000-8000-000000000201', file: 'c1070000-0000-4000-8000-000000000401', key: 'c1070000-0000-4000-8000-000000000701', request: 'c1070000-0000-4000-8000-000000000702' }
const context = (permissions: string[]) => ({ actorId: 'c1070000-0000-4000-8000-000000000901', tenantId: ids.tenant, companyId: ids.company, permissions, requestId: ids.request, db: {} })
const intent = { originalFilename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 8, sha256: 'a'.repeat(64) }
const finalize = { expectedVersion: 0 }
const link = { evidenceFileId: ids.file, evidenceKind: 'invoice' }

describe('CostEvidenceService', () => {
  it('creates signed uploads with overwrite disabled', async () => {
    const createSignedUploadUrl = vi.fn().mockResolvedValue({ data: { token: 'signed-token' }, error: null })
    const client = { rpc: vi.fn().mockResolvedValue({ data: { evidenceFileId: ids.file, version: 0, bucketId: 'c1-accounting-evidence', objectPath: `${ids.tenant}/${ids.company}/${ids.project}/${ids.file}`, expiresAt: '2026-09-22T00:15:00.000Z', replayed: false }, error: null }), storage: { from: vi.fn().mockReturnValue({ createSignedUploadUrl }) } }
    await new CostEvidenceRepository(client as never).createIntent(context([]), ids.project, intent as never, ids.key)
    expect(createSignedUploadUrl).toHaveBeenCalledWith(`${ids.tenant}/${ids.company}/${ids.project}/${ids.file}`, { upsert: false })
  })

  it('verifies downloaded bytes before finalize and issues read URLs for exactly 60 seconds', async () => {
    const blob = new Blob([new TextEncoder().encode('evidence')], { type: 'application/pdf' })
    const query = (data: unknown) => { const result = { data, error: null }; const value = { select: () => value, eq: () => value, order: () => value, maybeSingle: async () => result, then: (resolve: (result: unknown) => unknown) => Promise.resolve(result).then(resolve) }; return value }
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.test/evidence' }, error: null })
    const rpc = vi.fn().mockResolvedValue({ data: { id: ids.file, status: 'finalized', originalFilename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 8, sha256: 'ee8250fb76e094b34b471f13a73dbbe51d1ae142e9df59d7c0d31ec20f0a0a8e', version: 1, finalizedAt: '2026-09-22T00:01:00.000Z', replayed: false }, error: null })
    const client = {
      rpc,
      from: vi.fn().mockImplementation((table: string) => table === 'cost_evidence_links' ? query({ id: 'c1070000-0000-4000-8000-000000000501' }) : query({ bucket_id: 'c1-accounting-evidence', object_path: `${ids.tenant}/${ids.company}/${ids.project}/${ids.file}`, original_filename: 'invoice.pdf', status: 'finalized', declared_mime_type: 'application/pdf', declared_size_bytes: 8, declared_sha256: 'ee8250fb76e094b34b471f13a73dbbe51d1ae142e9df59d7c0d31ec20f0a0a8e' })),
      storage: { from: vi.fn().mockReturnValue({ download: vi.fn().mockResolvedValue({ data: blob, error: null }), createSignedUrl }) },
    }
    const repository = new CostEvidenceRepository(client as never)
    await repository.finalize(context([]), ids.file, finalize, ids.key)
    expect(rpc).toHaveBeenCalledWith('c1_finalize_cost_evidence', expect.objectContaining({ target_input: expect.objectContaining({ sizeBytes: 8, sha256: 'ee8250fb76e094b34b471f13a73dbbe51d1ae142e9df59d7c0d31ec20f0a0a8e' }) }))
    await repository.createReadUrl(context([]), ids.file, { disposition: 'inline' })
    expect(createSignedUrl).toHaveBeenCalledWith(`${ids.tenant}/${ids.company}/${ids.project}/${ids.file}`, 60, { download: false })
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
