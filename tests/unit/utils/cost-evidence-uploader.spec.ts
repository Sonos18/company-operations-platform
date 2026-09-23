import { describe, expect, it, vi } from 'vitest'
import {
  computeFileSha256Hex,
  uploadAndFinalizeEvidence,
  validateEvidenceFile,
} from '../../../app/utils/costs/cost-evidence-uploader'

describe('Cost Evidence Uploader utility', () => {
  it('validates file size and type', () => {
    const validFile = new File(['hello'], 'invoice.pdf', { type: 'application/pdf' })
    expect(validateEvidenceFile(validFile)).toEqual({ valid: true })

    const bigFile = new File([new Uint8Array(26 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    const bigResult = validateEvidenceFile(bigFile)
    expect(bigResult.valid).toBe(false)
    expect(bigResult.error).toContain('vượt quá giới hạn')

    const badTypeFile = new File(['test'], 'script.exe', { type: 'application/x-msdownload' })
    const badResult = validateEvidenceFile(badTypeFile)
    expect(badResult.valid).toBe(false)
    expect(badResult.error).toContain('không được hỗ trợ')
  })

  it('computes sha256 hex correctly', async () => {
    // SHA256 of "hello world" is b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
    const file = new File(['hello world'], 'test.txt', { type: 'text/plain' })
    const hex = await computeFileSha256Hex(file)
    expect(hex).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  it('orchestrates upload without signed tokens and links evidence', async () => {
    const file = new File(['pdf content'], 'receipt.pdf', { type: 'application/pdf' })
    const uploadSpy = vi.fn().mockResolvedValue({ error: null })
    const mockStorage = {
      from: vi.fn().mockReturnValue({ upload: uploadSpy }),
    }
    const mockSupabase = {
      storage: mockStorage,
    }

    const mockEvidenceRepo = {
      createUploadIntent: vi.fn().mockResolvedValue({
        evidenceFileId: 'c1010000-0000-4000-8000-000000000701',
        version: 0,
        bucketId: 'c1-accounting-evidence',
        objectPath: 'c1/p1/i1/f1',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        replayed: false,
      }),
      finalize: vi.fn().mockResolvedValue({
        id: 'c1010000-0000-4000-8000-000000000701',
        status: 'finalized',
        originalFilename: 'receipt.pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        sha256: 'abc',
        version: 1,
        finalizedAt: '2026-09-23T12:00:00.000Z',
        replayed: false,
      }),
      link: vi.fn().mockResolvedValue({
        linkId: 'c1010000-0000-4000-8000-000000000801',
        costId: 'c1010000-0000-4000-8000-000000000001',
        evidenceFileId: 'c1010000-0000-4000-8000-000000000701',
        evidenceKind: 'invoice',
        replayed: false,
      }),
      listMetadata: vi.fn(),
      getReadUrl: vi.fn(),
    }

    const progressTracker: string[] = []
    const result = await uploadAndFinalizeEvidence({
      projectId: 'c1010000-0000-4000-8000-000000000101',
      file,
      evidenceKind: 'invoice',
      projectCostItemId: 'c1010000-0000-4000-8000-000000000001',
      evidenceRepo: mockEvidenceRepo as never,
      supabaseClient: mockSupabase as never,
      onProgress: stage => progressTracker.push(stage),
    })

    expect(result.evidenceFileId).toBe('c1010000-0000-4000-8000-000000000701')
    expect(result.linkId).toBe('c1010000-0000-4000-8000-000000000801')
    expect(mockStorage.from).toHaveBeenCalledWith('c1-accounting-evidence')
    expect(uploadSpy).toHaveBeenCalledWith('c1/p1/i1/f1', file, {
      upsert: false,
      contentType: 'application/pdf',
    })
    expect(mockEvidenceRepo.finalize).toHaveBeenCalledWith('c1010000-0000-4000-8000-000000000701', { expectedVersion: 0 })
    expect(mockEvidenceRepo.link).toHaveBeenCalledWith('c1010000-0000-4000-8000-000000000001', {
      evidenceFileId: 'c1010000-0000-4000-8000-000000000701',
      evidenceKind: 'invoice',
      accountingSourceVersionId: undefined,
    })
    expect(progressTracker).toEqual(['hashing', 'intent', 'uploading', 'finalizing', 'linking'])
  })
})
