import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { COST_EVIDENCE_MAX_BYTES, costEvidenceCreateIntentInputSchema, costEvidenceMimeTypeSchema, costEvidenceUploadIntentSchema } from '../../../shared/schemas/costs/cost-evidence'
import { verifyEvidenceBlob } from '../../../server/features/costs/evidence/evidence-file-integrity'

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
    const intent = { evidenceFileId: id(1), version: 0, bucketId: 'c1-accounting-evidence', objectPath: `${id(2)}/${id(3)}/${id(4)}/${id(1)}`, expiresAt: '2026-09-22T00:15:00.000Z', replayed: false }
    expect(costEvidenceUploadIntentSchema.safeParse(intent).success).toBe(true)
    expect(costEvidenceUploadIntentSchema.safeParse({ ...intent, signedUploadToken: 'token' }).success).toBe(false)
    expect(costEvidenceUploadIntentSchema.safeParse({ ...intent, objectPath: `${id(2)}/${id(3)}/${id(4)}/invoice.pdf` }).success).toBe(false)
  })

  it('verifies PDF bytes while streaming the exact digest and byte ceiling', async () => {
    const blob = new Blob([new TextEncoder().encode('%PDF-1.7\n')], { type: 'application/pdf' })
    await expect(verifyEvidenceBlob(blob, 25 * 1024 * 1024, 'application/pdf')).resolves.toEqual({ sizeBytes: 9, sha256: '0716f9264c9fe19f5d7455276107f3ddcc1d3497f63d60689a73558ae8a1bf5e', mimeType: 'application/pdf' })
    await expect(verifyEvidenceBlob(blob, 8, 'application/pdf')).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
    await expect(verifyEvidenceBlob(new Blob(['not-pdf'], { type: 'application/pdf' }), 100, 'application/pdf')).rejects.toMatchObject({ code: 'EVIDENCE_UPLOAD_MISMATCH' })
  })

  it.each([
    ['image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
    ['application/vnd.ms-excel', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
  ] as const)('accepts the supported %s byte signature', async (mimeType, bytes) => {
    await expect(verifyEvidenceBlob(new Blob([bytes], { type: mimeType }), 100, mimeType)).resolves.toMatchObject({ mimeType, sizeBytes: bytes.byteLength })
  })

  it.each([
    ['image/png', new Uint8Array([0x89, 0x50, 0x4e])],
    ['image/jpeg', new Uint8Array([0xff, 0xd8, 0x00])],
    ['application/vnd.ms-excel', new Uint8Array([0xd0, 0xcf, 0x11, 0x00])],
  ] as const)('rejects invalid bytes claiming %s', async (mimeType, bytes) => {
    await expect(verifyEvidenceBlob(new Blob([bytes], { type: mimeType }), 100, mimeType)).rejects.toMatchObject({ code: 'EVIDENCE_UPLOAD_MISMATCH' })
  })

  it('distinguishes an XLSX workbook package from an arbitrary ZIP', async () => {
    const workbook = new JSZip()
    workbook.file('[Content_Types].xml', '<?xml version="1.0"?><Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>')
    workbook.file('xl/workbook.xml', '<?xml version="1.0"?><workbook/>')
    const validBytes = await workbook.generateAsync({ type: 'uint8array' })
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    await expect(verifyEvidenceBlob(new Blob([validBytes], { type: mimeType }), 1024 * 1024, mimeType)).resolves.toMatchObject({ mimeType, sizeBytes: validBytes.byteLength })

    const arbitrary = new JSZip()
    arbitrary.file('notes.txt', 'not a workbook')
    const invalidBytes = await arbitrary.generateAsync({ type: 'uint8array' })
    await expect(verifyEvidenceBlob(new Blob([invalidBytes], { type: mimeType }), 1024 * 1024, mimeType)).rejects.toMatchObject({ code: 'EVIDENCE_UPLOAD_MISMATCH' })
  })
})
