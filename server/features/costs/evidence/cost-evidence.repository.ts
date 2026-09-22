import { z } from 'zod'
import { COST_EVIDENCE_MAX_BYTES, costEvidenceFinalizedSchema, costEvidenceIntentAckSchema, costEvidenceLinkResultSchema, costEvidenceMetadataSchema, costEvidenceReadUrlSchema, costEvidenceUploadIntentSchema, type CostEvidenceCreateIntentInput, type CostEvidenceFinalizeInput, type CostEvidenceLinkInput, type CostEvidenceReadUrlInput } from '../../../../shared/schemas/costs/cost-evidence'
import { AppApiError } from '../../../utils/api-error'
import type { UserSupabaseClient } from '../../../utils/supabase-client'
import { hashEvidenceBlob } from './evidence-file-integrity'

type Result = { data: unknown; error: unknown }
interface Query extends PromiseLike<Result> { select(columns: string): Query; eq(column: string, value: string): Query; order(column: string): Query; maybeSingle(): Promise<Result> }
interface Bucket {
  createSignedUploadUrl(path: string, options: { upsert: false }): Promise<Result>
  download(path: string): Promise<Result>
  createSignedUrl(path: string, expiresIn: number, options?: { download?: string | boolean }): Promise<Result>
}
interface Client { rpc(name: string, args: Record<string, unknown>): Promise<Result>; from(table: string): Query; storage: { from(bucket: string): Bucket } }
export interface CostEvidenceContext { tenantId: string; companyId: string; requestId: string }

const pendingFileSchema = z.object({ bucket_id: z.string(), object_path: z.string(), declared_mime_type: z.string(), declared_size_bytes: z.number().int(), declared_sha256: z.string() }).passthrough()
const readFileSchema = z.object({ bucket_id: z.string(), object_path: z.string(), original_filename: z.string(), status: z.literal('finalized') }).passthrough()
const metadataRowSchema = z.object({ id: z.string().uuid(), evidence_file_id: z.string().uuid(), evidence_kind: z.string(), accounting_source_version_id: z.string().uuid().nullable(), cost_evidence_files: z.object({ original_filename: z.string(), verified_mime_type: z.string(), verified_size_bytes: z.number().int(), verified_sha256: z.string(), finalized_at: z.string() }).strict() }).strict()

function fail(message: string): never { throw new AppApiError(500, 'INTERNAL_ERROR', message) }
function rpcError(error: unknown): never {
  const parsed = z.object({ code: z.string().optional(), message: z.string().optional() }).safeParse(error)
  const code = parsed.success ? parsed.data.message ?? parsed.data.code : undefined
  if (code === 'PERMISSION_DENIED') throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  if (code === 'RESOURCE_NOT_FOUND') throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy chứng từ.')
  if (code === 'VERSION_CONFLICT' || code === 'IDEMPOTENCY_CONFLICT') throw new AppApiError(409, code, 'Dữ liệu chứng từ đã thay đổi.')
  if (code === 'FILE_TOO_LARGE') throw new AppApiError(413, 'FILE_TOO_LARGE', 'Tệp vượt quá giới hạn cho phép.')
  if (code === 'FILE_TYPE_UNSUPPORTED') throw new AppApiError(415, 'FILE_TYPE_UNSUPPORTED', 'Loại tệp không được hỗ trợ.')
  if (code === 'EVIDENCE_UPLOAD_MISMATCH') throw new AppApiError(409, 'EVIDENCE_UPLOAD_MISMATCH', 'Tệp tải lên không khớp với khai báo.')
  if (code === 'INPUT_INVALID') throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu không hợp lệ.')
  return fail('Không thể xử lý chứng từ.')
}

export class CostEvidenceRepository {
  private readonly client: Client
  constructor(client: UserSupabaseClient) { this.client = client as unknown as Client }

  async createIntent(context: CostEvidenceContext, projectId: string, input: CostEvidenceCreateIntentInput, idempotencyKey: string) {
    const response = await this.client.rpc('c1_create_cost_evidence_intent', { target_company_id: context.companyId, target_project_id: projectId, target_input: input, target_idempotency_key: idempotencyKey, target_request_id: context.requestId })
    if (response.error) return rpcError(response.error)
    const intent = costEvidenceIntentAckSchema.safeParse(response.data)
    if (!intent.success) return fail('Phản hồi upload intent không hợp lệ.')
    const signed = await this.client.storage.from(intent.data.bucketId).createSignedUploadUrl(intent.data.objectPath, { upsert: false })
    if (signed.error) return fail('Không thể tạo upload intent.')
    const token = z.object({ token: z.string().min(1) }).passthrough().safeParse(signed.data)
    if (!token.success) return fail('Phản hồi upload intent không hợp lệ.')
    return costEvidenceUploadIntentSchema.parse({ ...intent.data, signedUploadToken: token.data.token })
  }

  async finalize(context: CostEvidenceContext, evidenceFileId: string, input: CostEvidenceFinalizeInput, idempotencyKey: string) {
    const lookup = await this.client.from('cost_evidence_files').select('bucket_id,object_path,declared_mime_type,declared_size_bytes,declared_sha256').eq('tenant_id', context.tenantId).eq('company_id', context.companyId).eq('id', evidenceFileId).maybeSingle()
    if (lookup.error) return rpcError(lookup.error)
    const file = pendingFileSchema.safeParse(lookup.data)
    if (!file.success) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy chứng từ.')
    const downloaded = await this.client.storage.from(file.data.bucket_id).download(file.data.object_path)
    if (downloaded.error || !(downloaded.data instanceof Blob)) throw new AppApiError(409, 'EVIDENCE_UPLOAD_MISMATCH', 'Không thể xác minh tệp tải lên.')
    const identity = await hashEvidenceBlob(downloaded.data, COST_EVIDENCE_MAX_BYTES)
    if (downloaded.data.type !== file.data.declared_mime_type || identity.sizeBytes !== file.data.declared_size_bytes || identity.sha256 !== file.data.declared_sha256) throw new AppApiError(409, 'EVIDENCE_UPLOAD_MISMATCH', 'Tệp tải lên không khớp với khai báo.')
    const response = await this.client.rpc('c1_finalize_cost_evidence', { target_company_id: context.companyId, target_id: evidenceFileId, target_input: { expectedVersion: input.expectedVersion, mimeType: downloaded.data.type, ...identity }, target_idempotency_key: idempotencyKey, target_request_id: context.requestId })
    if (response.error) return rpcError(response.error)
    const result = costEvidenceFinalizedSchema.safeParse(response.data)
    return result.success ? result.data : fail('Phản hồi hoàn tất chứng từ không hợp lệ.')
  }

  async linkCost(context: CostEvidenceContext, projectCostItemId: string, input: CostEvidenceLinkInput, idempotencyKey: string) {
    const response = await this.client.rpc('c1_link_cost_evidence', { target_company_id: context.companyId, target_project_cost_item_id: projectCostItemId, target_input: input, target_idempotency_key: idempotencyKey, target_request_id: context.requestId })
    if (response.error) return rpcError(response.error)
    const result = costEvidenceLinkResultSchema.safeParse(response.data)
    return result.success ? result.data : fail('Phản hồi liên kết chứng từ không hợp lệ.')
  }

  async listCostEvidence(context: CostEvidenceContext, projectCostItemId: string) {
    const response = await this.client.from('cost_evidence_links').select('id,evidence_file_id,evidence_kind,accounting_source_version_id,cost_evidence_files!inner(original_filename,verified_mime_type,verified_size_bytes,verified_sha256,finalized_at)').eq('tenant_id', context.tenantId).eq('company_id', context.companyId).eq('project_cost_item_id', projectCostItemId).order('created_at')
    if (response.error) return rpcError(response.error)
    const rows = z.array(metadataRowSchema).safeParse(response.data)
    if (!rows.success) return fail('Phản hồi metadata chứng từ không hợp lệ.')
    return rows.data.map(row => costEvidenceMetadataSchema.parse({ linkId: row.id, evidenceFileId: row.evidence_file_id, evidenceKind: row.evidence_kind, accountingSourceVersionId: row.accounting_source_version_id, originalFilename: row.cost_evidence_files.original_filename, mimeType: row.cost_evidence_files.verified_mime_type, sizeBytes: row.cost_evidence_files.verified_size_bytes, sha256: row.cost_evidence_files.verified_sha256, finalizedAt: row.cost_evidence_files.finalized_at }))
  }

  async createReadUrl(context: CostEvidenceContext, evidenceFileId: string, input: CostEvidenceReadUrlInput) {
    const linked = await this.client.from('cost_evidence_links').select('id').eq('tenant_id', context.tenantId).eq('company_id', context.companyId).eq('evidence_file_id', evidenceFileId).maybeSingle()
    if (linked.error || !z.object({ id: z.string().uuid() }).passthrough().safeParse(linked.data).success) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy chứng từ.')
    const lookup = await this.client.from('cost_evidence_files').select('bucket_id,object_path,original_filename,status').eq('tenant_id', context.tenantId).eq('company_id', context.companyId).eq('id', evidenceFileId).maybeSingle()
    if (lookup.error) return rpcError(lookup.error)
    const file = readFileSchema.safeParse(lookup.data)
    if (!file.success) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy chứng từ.')
    const response = await this.client.storage.from(file.data.bucket_id).createSignedUrl(file.data.object_path, 60, { download: input.disposition === 'attachment' ? file.data.original_filename : false })
    if (response.error) return fail('Không thể tạo liên kết đọc chứng từ.')
    const signed = z.object({ signedUrl: z.string().url() }).passthrough().safeParse(response.data)
    if (!signed.success) return fail('Phản hồi liên kết đọc không hợp lệ.')
    return costEvidenceReadUrlSchema.parse({ url: signed.data.signedUrl, expiresAt: new Date(Date.now() + 60_000).toISOString() })
  }
}
