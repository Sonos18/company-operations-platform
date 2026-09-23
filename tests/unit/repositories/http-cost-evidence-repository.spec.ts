import { describe, expect, it, vi } from 'vitest'
import { createHttpCostEvidenceRepository } from '../../../app/repositories/http/http-cost-evidence-repository'

const companyId = 'c1010000-0000-4000-8000-000000000020'
const projectId = 'c1010000-0000-4000-8000-000000000101'
const costItemId = 'c1010000-0000-4000-8000-000000000001'
const evidenceFileId = 'c1010000-0000-4000-8000-000000000701'
const linkId = 'c1010000-0000-4000-8000-000000000801'
const idempotencyKey = 'c1010000-0000-4000-8000-000000000999'

const responseClient = (response: unknown) => ({
  request: vi.fn().mockImplementation(async input => input.schema ? input.schema.parse(response) : response),
})

describe('HTTP Cost Evidence repository', () => {
  it('creates upload intent with idempotency key and proper path', async () => {
    const uploadIntentResponse = {
      evidenceFileId,
      version: 0,
      bucketId: 'c1-accounting-evidence',
      objectPath: `${companyId}/${projectId}/${costItemId}/${evidenceFileId}`,
      expiresAt: '2026-09-23T12:00:00.000Z',
      replayed: false,
    }
    const client = responseClient(uploadIntentResponse)
    const repo = createHttpCostEvidenceRepository({
      companyId,
      client: client as never,
      createIdempotencyKey: () => idempotencyKey,
    })

    const input = {
      originalFilename: 'invoice.pdf',
      mimeType: 'application/pdf' as const,
      sizeBytes: 1024,
      sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    }

    const result = await repo.createUploadIntent(projectId, input)
    expect(result).toEqual(uploadIntentResponse)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      url: `/api/companies/${companyId}/projects/${projectId}/evidence/upload-intents`,
      method: 'POST',
      body: input,
      idempotencyKey,
    }))
  })

  it('finalizes evidence file', async () => {
    const finalizeResponse = {
      id: evidenceFileId,
      status: 'finalized',
      originalFilename: 'invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      version: 1,
      finalizedAt: '2026-09-23T12:05:00.000Z',
      replayed: false,
    }
    const client = responseClient(finalizeResponse)
    const repo = createHttpCostEvidenceRepository({
      companyId,
      client: client as never,
      createIdempotencyKey: () => idempotencyKey,
    })

    const result = await repo.finalize(evidenceFileId, { expectedVersion: 0 })
    expect(result).toEqual(finalizeResponse)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      url: `/api/companies/${companyId}/evidence-files/${evidenceFileId}/finalize`,
      method: 'POST',
      body: { expectedVersion: 0 },
      idempotencyKey,
    }))
  })

  it('links evidence to cost item', async () => {
    const linkResponse = {
      linkId,
      costId: costItemId,
      evidenceFileId,
      evidenceKind: 'invoice',
      replayed: false,
    }
    const client = responseClient(linkResponse)
    const repo = createHttpCostEvidenceRepository({
      companyId,
      client: client as never,
      createIdempotencyKey: () => idempotencyKey,
    })

    const result = await repo.link(costItemId, { evidenceFileId, evidenceKind: 'invoice' })
    expect(result).toEqual(linkResponse)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      url: `/api/companies/${companyId}/project-costs/${costItemId}/evidence`,
      method: 'POST',
      body: { evidenceFileId, evidenceKind: 'invoice' },
      idempotencyKey,
    }))
  })

  it('lists metadata for cost item', async () => {
    const metadataList = [
      {
        linkId,
        evidenceFileId,
        evidenceKind: 'invoice',
        accountingSourceVersionId: null,
        originalFilename: 'invoice.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        finalizedAt: '2026-09-23T12:05:00.000Z',
      },
    ]
    const client = responseClient(metadataList)
    const repo = createHttpCostEvidenceRepository({
      companyId,
      client: client as never,
    })

    const result = await repo.listMetadata(costItemId)
    expect(result).toEqual(metadataList)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      url: `/api/companies/${companyId}/project-costs/${costItemId}/evidence`,
      method: 'GET',
    }))
  })

  it('gets signed read URL', async () => {
    const readUrlResponse = {
      url: 'https://supabase.co/storage/v1/object/sign/c1-accounting-evidence/file.pdf?token=xyz',
      expiresAt: '2026-09-23T12:01:00.000Z',
    }
    const client = responseClient(readUrlResponse)
    const repo = createHttpCostEvidenceRepository({
      companyId,
      client: client as never,
    })

    const result = await repo.getReadUrl(evidenceFileId)
    expect(result).toEqual(readUrlResponse)
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      url: `/api/companies/${companyId}/evidence-files/${evidenceFileId}/read-url`,
      method: 'POST',
      body: { disposition: 'inline' },
    }))
  })
})
