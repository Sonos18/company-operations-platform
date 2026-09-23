import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import {
  COST_EVIDENCE_MAX_BYTES,
} from '../../../shared/schemas/costs/cost-evidence'
import type {
  CostEvidenceFinalized,
  CostEvidenceLinkResult,
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

function resolveEvidenceMimeType(file: File): CostEvidenceMimeType {
  const mime = file.type as CostEvidenceMimeType
  if (ALLOWED_EVIDENCE_MIME_TYPES.includes(mime)) return mime
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.xls') return 'application/vnd.ms-excel'
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  throw new Error('Định dạng tệp không được hỗ trợ.')
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
  idempotencyKey: string,
): Promise<CostEvidenceUploadIntent> {
  return evidenceRepo.createUploadIntent(projectId, {
    originalFilename: file.name,
    mimeType: mimeType as CostEvidenceMimeType,
    sizeBytes: file.size,
    sha256,
  }, { idempotencyKey })
}

export async function uploadToStorageWithIntent(
  supabaseClient: SupabaseClient,
  intent: CostEvidenceUploadIntent,
  file: File,
  mimeType: string,
): Promise<{ error: unknown | null }> {
  const { error } = await supabaseClient.storage
    .from(intent.bucketId)
    .upload(intent.objectPath, file, {
      upsert: false,
      contentType: mimeType,
    })
  return { error }
}

export interface EvidenceUploadSession {
  fingerprint: string
  intentKey: string
  finalizeKey: string
  linkKey?: string
  intentRefreshCount: number
  intent?: CostEvidenceUploadIntent
  storageState: 'not_started' | 'uploaded' | 'unknown'
  finalized?: CostEvidenceFinalized
  linkResult?: CostEvidenceLinkResult
}

function storageError(error: unknown): Error {
  const message = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'Không rõ nguyên nhân.'
  return new Error(`Lỗi tải tệp lên kho lưu trữ: ${message}`)
}

function storageStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const value = 'statusCode' in error ? error.statusCode : 'status' in error ? error.status : null
  if (value === null || value === undefined || value === '') return null
  const status = Number(value)
  return Number.isFinite(status) ? status : null
}

function isAmbiguousUploadError(error: unknown): boolean {
  const status = storageStatus(error)
  if (status !== null) return status >= 500
  const message = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error)
  return /network|fetch|timeout|connection|aborted|storage error/iu.test(message)
}

export interface UploadEvidenceOptions {
  companyId: string
  projectId: string
  file: File
  evidenceKind: CostEvidenceKind
  projectCostItemId?: string
  accountingSourceVersionId?: string
  evidenceRepo: CostEvidenceRepository
  supabaseClient: SupabaseClient
  onProgress?: (stage: 'hashing' | 'intent' | 'uploading' | 'finalizing' | 'linking') => void
  nowProvider?: () => number
  session?: EvidenceUploadSession | null
  onSessionChange?: (session: EvidenceUploadSession) => void
}

export interface UploadEvidenceResult {
  evidenceFileId: string
  originalFilename: string
  sizeBytes: number
  mimeType: string
  linkId?: string
}

export async function uploadAndFinalizeEvidence(options: UploadEvidenceOptions): Promise<UploadEvidenceResult> {
  const { companyId, projectId, file, evidenceRepo, supabaseClient, onProgress, nowProvider = () => Date.now() } = options

  const validation = validateEvidenceFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const mimeType = resolveEvidenceMimeType(file)

  onProgress?.('hashing')
  const sha256 = await computeFileSha256Hex(file)

  const fingerprint = JSON.stringify({ companyId, projectId, fileName: file.name, fileSize: file.size, mimeType, sha256, evidenceKind: options.evidenceKind, projectCostItemId: options.projectCostItemId ?? null, accountingSourceVersionId: options.accountingSourceVersionId ?? null })
  let session = options.session?.fingerprint === fingerprint
    ? options.session
    : {
        fingerprint,
        intentKey: globalThis.crypto.randomUUID(),
        finalizeKey: globalThis.crypto.randomUUID(),
        linkKey: options.projectCostItemId ? globalThis.crypto.randomUUID() : undefined,
        intentRefreshCount: 0,
        storageState: 'not_started' as const,
      }
  const save = (next: EvidenceUploadSession) => {
    session = next
    options.onSessionChange?.(next)
  }
  save(session)

  while (!session.finalized) {
    if (!session.intent) {
      onProgress?.('intent')
      const intent = await createEvidenceIntent(evidenceRepo, projectId, file, mimeType, sha256, session.intentKey)
      save({ ...session, intent })
    }
    const currentIntent = session.intent
    if (!currentIntent) throw new Error('Không thể khởi tạo upload intent.')

    if (isIntentExpired(currentIntent, nowProvider())) {
      if (session.intentRefreshCount >= 1) throw new Error('Upload intent đã hết hạn ngay khi tạo lại.')
      save({
        fingerprint,
        intentKey: globalThis.crypto.randomUUID(),
        finalizeKey: globalThis.crypto.randomUUID(),
        linkKey: options.projectCostItemId ? globalThis.crypto.randomUUID() : undefined,
        intentRefreshCount: session.intentRefreshCount + 1,
        storageState: 'not_started',
      })
      continue
    }

    if (session.storageState !== 'uploaded') {
      const priorStorageState = session.storageState
      onProgress?.('uploading')
      const uploadResult = await uploadToStorageWithIntent(supabaseClient, currentIntent, file, mimeType)
      if (!uploadResult.error) {
        save({ ...session, storageState: 'uploaded' })
      }
      else if (isIntentExpired(currentIntent, nowProvider())) {
        if (session.intentRefreshCount >= 1) throw storageError(uploadResult.error)
        save({
          fingerprint,
          intentKey: globalThis.crypto.randomUUID(),
          finalizeKey: globalThis.crypto.randomUUID(),
          linkKey: options.projectCostItemId ? globalThis.crypto.randomUUID() : undefined,
          intentRefreshCount: session.intentRefreshCount + 1,
          storageState: 'not_started',
        })
        continue
      }
      else if (isAmbiguousUploadError(uploadResult.error) || (priorStorageState === 'unknown' && storageStatus(uploadResult.error) === 409)) {
        save({ ...session, storageState: 'unknown' })
      }
      else {
        throw storageError(uploadResult.error)
      }
    }

    if (isIntentExpired(currentIntent, nowProvider())) {
      if (session.intentRefreshCount >= 1) throw new Error('Upload intent đã hết hạn trước khi hoàn tất.')
      save({
        fingerprint,
        intentKey: globalThis.crypto.randomUUID(),
        finalizeKey: globalThis.crypto.randomUUID(),
        linkKey: options.projectCostItemId ? globalThis.crypto.randomUUID() : undefined,
        intentRefreshCount: session.intentRefreshCount + 1,
        storageState: 'not_started',
      })
      continue
    }

    onProgress?.('finalizing')
    const finalized = await evidenceRepo.finalize(currentIntent.evidenceFileId, { expectedVersion: currentIntent.version }, { idempotencyKey: session.finalizeKey })
    save({ ...session, finalized })
  }

  if (options.projectCostItemId && !session.linkResult) {
    onProgress?.('linking')
    const linkResult = await evidenceRepo.link(options.projectCostItemId, {
      evidenceFileId: session.finalized.id,
      evidenceKind: options.evidenceKind,
      accountingSourceVersionId: options.accountingSourceVersionId,
    }, { idempotencyKey: session.linkKey! })
    save({ ...session, linkResult })
  }

  return {
    evidenceFileId: session.finalized.id,
    originalFilename: session.finalized.originalFilename,
    sizeBytes: session.finalized.sizeBytes,
    mimeType: session.finalized.mimeType,
    linkId: session.linkResult?.linkId,
  }
}
