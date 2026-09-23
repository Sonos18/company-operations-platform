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

  describe('Bounded upload retry on intent expiry (F-UI4)', () => {
    it('retries with a fresh intent when intent is expired before upload', async () => {
      const file = new File(['data'], 'receipt.pdf', { type: 'application/pdf' })
      const uploadSpy = vi.fn().mockResolvedValue({ error: null })
      const mockSupabase = {
        storage: { from: vi.fn().mockReturnValue({ upload: uploadSpy }) },
      }

      const createUploadIntent = vi.fn()
        // First intent already expired
        .mockResolvedValueOnce({
          evidenceFileId: 'file-1',
          version: 0,
          bucketId: 'c1-accounting-evidence',
          objectPath: 'c1/p1/expired-path',
          expiresAt: new Date(Date.now() - 5000).toISOString(),
          replayed: false,
        })
        // Second intent valid
        .mockResolvedValueOnce({
          evidenceFileId: 'file-2',
          version: 0,
          bucketId: 'c1-accounting-evidence',
          objectPath: 'c1/p1/fresh-path',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          replayed: false,
        })

      const mockEvidenceRepo = {
        createUploadIntent,
        finalize: vi.fn().mockResolvedValue({
          id: 'file-2',
          status: 'finalized',
          originalFilename: 'receipt.pdf',
          mimeType: 'application/pdf',
          sizeBytes: file.size,
          sha256: 'abc',
          version: 1,
          finalizedAt: '2026-09-23T12:00:00.000Z',
          replayed: false,
        }),
        link: vi.fn().mockResolvedValue({ linkId: 'link-1' }),
      }

      const result = await uploadAndFinalizeEvidence({
        projectId: 'proj-1',
        file,
        evidenceKind: 'invoice',
        evidenceRepo: mockEvidenceRepo as never,
        supabaseClient: mockSupabase as never,
      })

      expect(createUploadIntent).toHaveBeenCalledTimes(2)
      // New intent uses new returned objectPath
      expect(uploadSpy).toHaveBeenCalledTimes(1)
      expect(uploadSpy).toHaveBeenCalledWith('c1/p1/fresh-path', file, {
        upsert: false,
        contentType: 'application/pdf',
      })
      expect(mockEvidenceRepo.finalize).toHaveBeenCalledWith('file-2', { expectedVersion: 0 })
      expect(result.evidenceFileId).toBe('file-2')
    })

    it('retries once with a fresh intent when upload fails and intent is beyond expiresAt', async () => {
      const file = new File(['data'], 'receipt.pdf', { type: 'application/pdf' })
      let currentTime = 1000
      const nowProvider = () => currentTime

      const uploadSpy = vi.fn()
        .mockImplementationOnce(async () => {
          currentTime = 2500 // now beyond expiresAt (2000)
          return { error: { message: 'Storage error' } }
        })
        .mockResolvedValueOnce({ error: null })

      const mockSupabase = {
        storage: { from: vi.fn().mockReturnValue({ upload: uploadSpy }) },
      }

      const createUploadIntent = vi.fn()
        // First intent expires at 2000
        .mockResolvedValueOnce({
          evidenceFileId: 'file-1',
          version: 0,
          bucketId: 'c1-accounting-evidence',
          objectPath: 'c1/p1/path-1',
          expiresAt: new Date(2000).toISOString(),
          replayed: false,
        })
        // Second intent expires at 60000
        .mockResolvedValueOnce({
          evidenceFileId: 'file-2',
          version: 0,
          bucketId: 'c1-accounting-evidence',
          objectPath: 'c1/p1/path-2',
          expiresAt: new Date(60000).toISOString(),
          replayed: false,
        })

      const mockEvidenceRepo = {
        createUploadIntent,
        finalize: vi.fn().mockResolvedValue({
          id: 'file-2',
          status: 'finalized',
          originalFilename: 'receipt.pdf',
          mimeType: 'application/pdf',
          sizeBytes: file.size,
          sha256: 'abc',
          version: 1,
          finalizedAt: '2026-09-23T12:00:00.000Z',
          replayed: false,
        }),
      }

      const result = await uploadAndFinalizeEvidence({
        projectId: 'proj-1',
        file,
        evidenceKind: 'invoice',
        evidenceRepo: mockEvidenceRepo as never,
        supabaseClient: mockSupabase as never,
        nowProvider,
      })

      expect(createUploadIntent).toHaveBeenCalledTimes(2)
      expect(uploadSpy).toHaveBeenCalledTimes(2)
      expect(uploadSpy).toHaveBeenNthCalledWith(1, 'c1/p1/path-1', file, {
        upsert: false,
        contentType: 'application/pdf',
      })
      expect(uploadSpy).toHaveBeenNthCalledWith(2, 'c1/p1/path-2', file, {
        upsert: false,
        contentType: 'application/pdf',
      })
      expect(result.evidenceFileId).toBe('file-2')
    })

    it('propagates error without retry when upload fails while intent is still valid', async () => {
      const file = new File(['data'], 'receipt.pdf', { type: 'application/pdf' })
      const uploadSpy = vi.fn().mockResolvedValue({ error: { message: 'Network connection aborted' } })
      const mockSupabase = {
        storage: { from: vi.fn().mockReturnValue({ upload: uploadSpy }) },
      }

      const createUploadIntent = vi.fn().mockResolvedValue({
        evidenceFileId: 'file-1',
        version: 0,
        bucketId: 'c1-accounting-evidence',
        objectPath: 'c1/p1/path-1',
        expiresAt: new Date(Date.now() + 60000).toISOString(), // valid for 60s
        replayed: false,
      })

      const mockEvidenceRepo = {
        createUploadIntent,
        finalize: vi.fn(),
      }

      await expect(uploadAndFinalizeEvidence({
        projectId: 'proj-1',
        file,
        evidenceKind: 'invoice',
        evidenceRepo: mockEvidenceRepo as never,
        supabaseClient: mockSupabase as never,
      })).rejects.toThrow('Lỗi tải tệp lên kho lưu trữ: Network connection aborted')

      // Exactly 1 intent, no retry because intent has not expired
      expect(createUploadIntent).toHaveBeenCalledTimes(1)
      expect(uploadSpy).toHaveBeenCalledTimes(1)
      expect(mockEvidenceRepo.finalize).not.toHaveBeenCalled()
    })

    it('propagates second failure without a third intent', async () => {
      const file = new File(['data'], 'receipt.pdf', { type: 'application/pdf' })
      let currentTime = 1000
      const nowProvider = () => currentTime

      const uploadSpy = vi.fn()
        .mockImplementationOnce(async () => {
          currentTime = 2000 // now beyond first expiry (1500)
          return { error: { message: 'First failure' } }
        })
        .mockImplementationOnce(async () => {
          currentTime = 3000 // now beyond second expiry (2500)
          return { error: { message: 'Second failure' } }
        })

      const mockSupabase = {
        storage: { from: vi.fn().mockReturnValue({ upload: uploadSpy }) },
      }

      const createUploadIntent = vi.fn()
        .mockResolvedValueOnce({
          evidenceFileId: 'file-1',
          version: 0,
          bucketId: 'c1-accounting-evidence',
          objectPath: 'c1/p1/path-1',
          expiresAt: new Date(1500).toISOString(),
          replayed: false,
        })
        .mockResolvedValueOnce({
          evidenceFileId: 'file-2',
          version: 0,
          bucketId: 'c1-accounting-evidence',
          objectPath: 'c1/p1/path-2',
          expiresAt: new Date(2500).toISOString(),
          replayed: false,
        })

      const mockEvidenceRepo = {
        createUploadIntent,
        finalize: vi.fn(),
      }

      await expect(uploadAndFinalizeEvidence({
        projectId: 'proj-1',
        file,
        evidenceKind: 'invoice',
        evidenceRepo: mockEvidenceRepo as never,
        supabaseClient: mockSupabase as never,
        nowProvider,
      })).rejects.toThrow('Lỗi tải tệp lên kho lưu trữ: Second failure')

      // Maximum 1 retry (2 intents total), never a 3rd intent
      expect(createUploadIntent).toHaveBeenCalledTimes(2)
      expect(uploadSpy).toHaveBeenCalledTimes(2)
      expect(mockEvidenceRepo.finalize).not.toHaveBeenCalled()
    })
  })
})
