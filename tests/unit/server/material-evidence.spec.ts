import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { PermissionCode } from '../../../shared/constants/permissions'
import { MaterialProcurementService, type MaterialProcurementContext, type MaterialProcurementDataRepository } from '../../../server/features/costs/material-procurement/service'
import { SupabaseMaterialProcurementRepository } from '../../../server/features/costs/material-procurement/repository'
import { accountantRoleScope, engineerRoleScope, ids, purchasingRoleScope } from '../material-procurement/fixtures'

const tenantId = '10000000-0000-4000-8000-000000000001'
const companyId = '10000000-0000-4000-8000-000000000002'
const requestId = '10000000-0000-4000-8000-000000000003'
const key = '10000000-0000-4000-8000-000000000004'
const bytes = new TextEncoder().encode('%PDF-1.7 material quotation')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const unsignedIntent = {
  originalFilename: 'quotation.pdf',
  mimeType: 'application/pdf' as const,
  sizeBytes: bytes.byteLength,
  sha256,
  evidenceRole: 'unsigned_quotation' as const,
  target: { kind: 'material_proposal' as const, proposalId: ids.proposal, revisionId: ids.proposalRevision },
}
const signedIntent = {
  ...unsignedIntent,
  evidenceRole: 'signed_contract' as const,
  target: { kind: 'material_order' as const, orderId: ids.order },
}
const uploadIntent = {
  evidenceFileId: ids.unsignedQuotation,
  version: 0,
  bucketId: 'c1-accounting-evidence' as const,
  objectPath: tenantId + '/' + companyId + '/' + ids.project + '/' + ids.unsignedQuotation,
  expiresAt: '2026-10-08T08:15:00.000Z',
  replayed: false,
}
const finalized = {
  id: ids.unsignedQuotation,
  status: 'finalized' as const,
  originalFilename: 'quotation.pdf',
  mimeType: 'application/pdf' as const,
  sizeBytes: bytes.byteLength,
  sha256,
  version: 1,
  finalizedAt: '2026-10-08T08:00:00.000Z',
  replayed: false,
}

function context(permissions: readonly PermissionCode[]): MaterialProcurementContext {
  return { actorId: ids.user, tenantId, companyId, requestId, permissions }
}

function serviceRepository(): MaterialProcurementDataRepository {
  const command = { resourceId: ids.order, version: 1, replayed: false }
  return {
    listProjects: vi.fn(async () => []), listMaterials: vi.fn(async () => []),
    createMaterial: vi.fn(async () => command), updateMaterial: vi.fn(async () => command),
    listSupplierNames: vi.fn(async () => []), recordSupplierName: vi.fn(async () => command),
    resolveSupplier: vi.fn(async () => command), listProposals: vi.fn(async () => []), readProposal: vi.fn(),
    createProposal: vi.fn(async () => command), updateProposal: vi.fn(async () => command),
    submitProposal: vi.fn(async () => command), decideProposal: vi.fn(async () => command),
    createOrder: vi.fn(async () => command), listOrders: vi.fn(async () => []), readOrder: vi.fn(),
    cancelOrder: vi.fn(async () => command),
    createEvidenceIntent: vi.fn(async () => uploadIntent),
    finalizeEvidence: vi.fn(async () => finalized),
    readEvidenceUrl: vi.fn(async () => ({ url: 'https://example.invalid/file', expiresAt: '2026-10-08T08:01:00.000Z' })),
  }
}

describe('material evidence service', () => {
  it('routes upload authority by evidence role and blocks engineers before the repository', async () => {
    const data = serviceRepository()
    const service = new MaterialProcurementService(data)

    await expect(service.createEvidenceIntent(context(engineerRoleScope), ids.project, unsignedIntent, key))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(service.readEvidenceUrl(context(engineerRoleScope), ids.project, ids.unsignedQuotation, {}))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(data.createEvidenceIntent).not.toHaveBeenCalled()
    expect(data.readEvidenceUrl).not.toHaveBeenCalled()

    await service.createEvidenceIntent(context(purchasingRoleScope), ids.project, unsignedIntent, key)
    await service.createEvidenceIntent(context(accountantRoleScope), ids.project, signedIntent, key)
    await expect(service.createEvidenceIntent(context(purchasingRoleScope), ids.project, signedIntent, key))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(data.createEvidenceIntent).toHaveBeenCalledTimes(2)
  })
})

describe('material evidence repository', () => {
  it('uses a creator-bound target before download and sends only verified identity to service role', async () => {
    const download = vi.fn(async () => ({ data: new Blob([bytes], { type: 'application/pdf' }), error: null }))
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'c1_material_evidence_finalization_target'
        ? { status: 'pending_upload', bucketId: 'c1-accounting-evidence', objectPath: uploadIntent.objectPath, declaredMimeType: 'application/pdf', declaredSizeBytes: bytes.byteLength, declaredSha256: sha256 }
        : uploadIntent,
      error: null,
    }))
    const finalizer = { finalize: vi.fn(async () => ({ data: finalized, error: null })) }
    const client = { rpc, storage: { from: vi.fn(() => ({ download, createSignedUrl: vi.fn() })) } }
    const repository = new SupabaseMaterialProcurementRepository(client as never, finalizer)

    await expect(repository.finalizeEvidence(context(purchasingRoleScope), ids.project, ids.unsignedQuotation, { expectedVersion: 0 }, key))
      .resolves.toEqual(finalized)
    expect(rpc).toHaveBeenCalledWith('c1_material_evidence_finalization_target', {
      target_company_id: companyId,
      target_project_id: ids.project,
      target_id: ids.unsignedQuotation,
    })
    expect(finalizer.finalize).toHaveBeenCalledWith({
      target_actor_id: ids.user,
      target_company_id: companyId,
      target_project_id: ids.project,
      target_id: ids.unsignedQuotation,
      target_input: { expectedVersion: 0, mimeType: 'application/pdf', sizeBytes: bytes.byteLength, sha256 },
      target_idempotency_key: key,
      target_request_id: requestId,
    })
  })

  it('replays an already finalized file without downloading it again', async () => {
    const download = vi.fn()
    const rpc = vi.fn(async () => ({ data: { status: 'finalized' }, error: null }))
    const finalizer = { finalize: vi.fn(async () => ({ data: { ...finalized, replayed: true }, error: null })) }
    const client = { rpc, storage: { from: vi.fn(() => ({ download })) } }
    const repository = new SupabaseMaterialProcurementRepository(client as never, finalizer)

    await expect(repository.finalizeEvidence(context(purchasingRoleScope), ids.project, ids.unsignedQuotation, { expectedVersion: 0 }, key))
      .resolves.toMatchObject({ replayed: true })
    expect(download).not.toHaveBeenCalled()
    expect(finalizer.finalize).toHaveBeenCalledWith(expect.objectContaining({ target_input: { expectedVersion: 0 } }))
  })

  it('signs only the guarded material read target for 60 seconds', async () => {
    const signed = vi.fn(async () => ({ data: { signedUrl: 'https://example.invalid/material' }, error: null }))
    const rpc = vi.fn(async () => ({ data: { bucketId: 'c1-accounting-evidence', objectPath: uploadIntent.objectPath }, error: null }))
    const client = { rpc, storage: { from: vi.fn(() => ({ createSignedUrl: signed })) } }
    const repository = new SupabaseMaterialProcurementRepository(client as never)

    await expect(repository.readEvidenceUrl(context(purchasingRoleScope), ids.project, ids.unsignedQuotation, { disposition: 'attachment' }))
      .resolves.toMatchObject({ url: 'https://example.invalid/material' })
    expect(rpc).toHaveBeenCalledWith('c1_material_evidence_read_target', {
      target_company_id: companyId,
      target_project_id: ids.project,
      target_id: ids.unsignedQuotation,
    })
    expect(signed).toHaveBeenCalledWith(uploadIntent.objectPath, 60, { download: true })
  })
})
