import { describe, expect, it } from 'vitest'
import { COST_EVIDENCE_MAX_BYTES, costEvidenceCreateIntentInputSchema, costEvidenceMimeTypeSchema, costEvidenceUploadIntentSchema } from '../../../shared/schemas/costs/cost-evidence'
import { hashEvidenceBlob } from '../../../server/features/costs/evidence/evidence-file-integrity'

describe('cost evidence contracts', () => {
  it('pins the exact MIME allow-list and 25 MiB boundary', () => {
    expect(costEvidenceMimeTypeSchema.options).toEqual(['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg'])
    const input = { originalFilename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: COST_EVIDENCE_MAX_BYTES, sha256: 'a'.repeat(64) }
    expect(costEvidenceCreateIntentInputSchema.safeParse(input).success).toBe(true)
    expect(costEvidenceCreateIntentInputSchema.safeParse({ ...input, sizeBytes: COST_EVIDENCE_MAX_BYTES + 1 }).success).toBe(false)
    expect(costEvidenceCreateIntentInputSchema.safeParse({ ...input, sha256: 'A'.repeat(64) }).success).toBe(false)
  })

  it('requires immutable scoped object paths without filenames', () => {
    const id = (value: number) => `c1070000-0000-4000-8000-${String(value).padStart(12, '0')}`
    expect(costEvidenceUploadIntentSchema.safeParse({ evidenceFileId: id(1), version: 0, bucketId: 'c1-accounting-evidence', objectPath: `${id(2)}/${id(3)}/${id(4)}/${id(1)}`, signedUploadToken: 'token', expiresAt: '2026-09-22T00:15:00.000Z', replayed: false }).success).toBe(true)
    expect(costEvidenceUploadIntentSchema.safeParse({ evidenceFileId: id(1), version: 0, bucketId: 'c1-accounting-evidence', objectPath: `${id(2)}/${id(3)}/${id(4)}/invoice.pdf`, signedUploadToken: 'token', expiresAt: '2026-09-22T00:15:00.000Z', replayed: false }).success).toBe(false)
  })

  it('streams a lowercase exact SHA-256 and enforces the byte ceiling', async () => {
    const blob = new Blob([new TextEncoder().encode('evidence')], { type: 'application/pdf' })
    await expect(hashEvidenceBlob(blob, 25 * 1024 * 1024)).resolves.toEqual({ sizeBytes: 8, sha256: 'ee8250fb76e094b34b471f13a73dbbe51d1ae142e9df59d7c0d31ec20f0a0a8e' })
    await expect(hashEvidenceBlob(blob, 7)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  })
})
