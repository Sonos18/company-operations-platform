import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import {
  COST_EVIDENCE_MAX_BYTES,
} from '../../../shared/schemas/costs/cost-evidence'
import type {
  costEvidenceKindSchema,
  costEvidenceMimeTypeSchema,
  CostEvidenceUploadIntent,
} from '../../../shared/schemas/costs/cost-evidence'
import type { CostEvidenceRepository } from '../../repositories/contracts'

export type CostEvidenceKind = z.infer<typeof costEvidenceKindSchema>
export type CostEvidenceMimeType = z.infer<typeof costEvidenceMimeTypeSchema>

export const ALLOWED_EVIDENCE_MIME_TYPES: readonly CostEvidenceMimeType[] = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
]

export const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.xls', '.xlsx', '.png', '.jpg', '.jpeg']

export interface FileValidationResult {
  valid: boolean
  error?: string
}

export function validateEvidenceFile(file: File): FileValidationResult {
  if (file.size > COST_EVIDENCE_MAX_BYTES) {
    return {
      valid: false,
      error: `Dung lượng tệp (${(file.size / (1024 * 1024)).toFixed(1)} MiB) vượt quá giới hạn tối đa 25 MiB.`,
    }
  }

  // Derive mime type or normalize
  let mime = file.type as CostEvidenceMimeType
  if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(mime)) {
    // Try to guess from extension if browser left type empty or generic
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (ext === '.pdf') mime = 'application/pdf'
    else if (ext === '.xls') mime = 'application/vnd.ms-excel'
    else if (ext === '.xlsx') mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    else if (ext === '.png') mime = 'image/png'
    else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg'
  }

  if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(mime)) {
    return {
      valid: false,
      error: `Định dạng tệp "${file.type || file.name}" không được hỗ trợ. Chỉ chấp nhận PDF, XLS, XLSX, PNG, JPEG.`,
    }
  }

  return { valid: true }
}

export async function computeFileSha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function isIntentExpired(intent: { expiresAt: string }, now = Date.now()): boolean {
  return now >= new Date(intent.expiresAt).getTime()
}

export async function createEvidenceIntent(
  evidenceRepo: CostEvidenceRepository,
  projectId: string,
  file: File,
  mimeType: string,
  sha256: string,
): Promise<CostEvidenceUploadIntent> {
  return evidenceRepo.createUploadIntent(projectId, {
    originalFilename: file.name,
    mimeType: mimeType as CostEvidenceMimeType,
    sizeBytes: file.size,
    sha256,
  })
}

export async function uploadToStorageWithIntent(
  supabaseClient: SupabaseClient,
  intent: CostEvidenceUploadIntent,
  file: File,
  mimeType: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabaseClient.storage
    .from(intent.bucketId)
    .upload(intent.objectPath, file, {
      upsert: false,
      contentType: mimeType,
    })
  return { error: error ? new Error(`Lỗi tải tệp lên kho lưu trữ: ${error.message}`) : null }
}

export interface UploadWithBoundedRetryParams {
  projectId: string
  file: File
  mimeType: string
  sha256: string
  evidenceRepo: CostEvidenceRepository
  supabaseClient: SupabaseClient
  onProgress?: (stage: 'hashing' | 'intent' | 'uploading' | 'finalizing' | 'linking') => void
  nowProvider?: () => number
}

export async function uploadWithBoundedRetry(params: UploadWithBoundedRetryParams): Promise<CostEvidenceUploadIntent> {
  const { projectId, file, mimeType, sha256, evidenceRepo, supabaseClient, onProgress, nowProvider = () => Date.now() } = params

  let hasRetried = false
  onProgress?.('intent')
  let currentIntent = await createEvidenceIntent(evidenceRepo, projectId, file, mimeType, sha256)

  // Handle intent expired before upload
  if (isIntentExpired(currentIntent, nowProvider())) {
    hasRetried = true
    onProgress?.('intent')
    currentIntent = await createEvidenceIntent(evidenceRepo, projectId, file, mimeType, sha256)
    if (isIntentExpired(currentIntent, nowProvider())) {
      throw new Error('Upload intent đã hết hạn ngay khi tạo lại.')
    }
  }

  onProgress?.('uploading')
  let uploadResult = await uploadToStorageWithIntent(supabaseClient, currentIntent, file, mimeType)

  if (uploadResult.error) {
    // If upload failed and current time is now beyond expiresAt and we haven't retried yet:
    if (!hasRetried && isIntentExpired(currentIntent, nowProvider())) {
      onProgress?.('intent')
      currentIntent = await createEvidenceIntent(evidenceRepo, projectId, file, mimeType, sha256)
      if (isIntentExpired(currentIntent, nowProvider())) {
        throw new Error('Upload intent đã hết hạn ngay khi tạo lại.')
      }
      onProgress?.('uploading')
      uploadResult = await uploadToStorageWithIntent(supabaseClient, currentIntent, file, mimeType)
      if (uploadResult.error) {
        throw uploadResult.error
      }
    }
    else {
      // Propagate original error (intent was not expired, or retry already exhausted)
      throw uploadResult.error
    }
  }

  return currentIntent
}

export interface UploadEvidenceOptions {
  projectId: string
  file: File
  evidenceKind: CostEvidenceKind
  projectCostItemId?: string
  accountingSourceVersionId?: string
  evidenceRepo: CostEvidenceRepository
  supabaseClient: SupabaseClient
  onProgress?: (stage: 'hashing' | 'intent' | 'uploading' | 'finalizing' | 'linking') => void
  nowProvider?: () => number
}

export interface UploadEvidenceResult {
  evidenceFileId: string
  originalFilename: string
  sizeBytes: number
  mimeType: string
  linkId?: string
}

export async function uploadAndFinalizeEvidence(options: UploadEvidenceOptions): Promise<UploadEvidenceResult> {
  const { projectId, file, evidenceRepo, supabaseClient, onProgress, nowProvider } = options

  const validation = validateEvidenceFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  let mimeType = file.type as CostEvidenceMimeType
  if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(mimeType)) {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (ext === '.pdf') mimeType = 'application/pdf'
    else if (ext === '.xls') mimeType = 'application/vnd.ms-excel'
    else if (ext === '.xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    else if (ext === '.png') mimeType = 'image/png'
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg'
  }

  onProgress?.('hashing')
  const sha256 = await computeFileSha256Hex(file)

  const currentIntent = await uploadWithBoundedRetry({
    projectId,
    file,
    mimeType,
    sha256,
    evidenceRepo,
    supabaseClient,
    onProgress,
    nowProvider,
  })

  onProgress?.('finalizing')
  const finalized = await evidenceRepo.finalize(currentIntent.evidenceFileId, {
    expectedVersion: currentIntent.version,
  })

  let linkId: string | undefined
  if (options.projectCostItemId) {
    onProgress?.('linking')
    const linkResult = await evidenceRepo.link(options.projectCostItemId, {
      evidenceFileId: finalized.id,
      evidenceKind: options.evidenceKind,
      accountingSourceVersionId: options.accountingSourceVersionId,
    })
    linkId = linkResult.linkId
  }

  return {
    evidenceFileId: finalized.id,
    originalFilename: finalized.originalFilename,
    sizeBytes: finalized.sizeBytes,
    mimeType: finalized.mimeType,
    linkId,
  }
}
