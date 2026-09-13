import { randomUUID } from 'node:crypto'
import { createFileUploadIntentInputSchema, filePreviewQuerySchema, maxSourceFileBytes, type FileObject } from '../../../shared/schemas/files'
import type { PermissionCode } from '../../../shared/constants/permissions'
import { AppApiError } from '../../utils/api-error'

const bucket = 'taskovia-c1-financial'
const spreadsheetMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const supportedExtensions: Record<string, readonly string[]> = {
  [spreadsheetMime]: ['xlsx'], 'application/vnd.ms-excel': ['xls'], 'application/pdf': ['pdf'], 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'],
}
type Context = { actorId: string; tenantId: string; companyId: string; permissions: readonly PermissionCode[]; requestId: string }
type Metadata = { byteSize: number; mimeType: string; sha256: string }
type Repository = { createPending(input: Record<string, unknown>): Promise<FileObject>; getById(companyId: string, tenantId: string, id: string): Promise<FileObject | null>; finalize(input: Record<string, unknown>): Promise<FileObject> }
type Storage = { createUploadUrl(bucket: string, objectKey: string, options: { upsert: false }): Promise<string>; getMetadata(bucket: string, objectKey: string): Promise<Metadata>; createReadUrl(bucket: string, objectKey: string, seconds: number): Promise<{ url: string; expiresAt: string }>; getBytes?: (bucket: string, objectKey: string) => Promise<Buffer> }
type Preview = { preview(bytes: Buffer, query: Record<string, unknown>): unknown }

function fail(statusCode: number, code: 'PERMISSION_DENIED' | 'RESOURCE_NOT_FOUND' | 'FILE_TOO_LARGE' | 'FILE_TYPE_UNSUPPORTED' | 'SOURCE_FILE_NOT_READY', message: string): never { throw new AppApiError(statusCode, code, message) }
function extension(name: string) { return name.trim().toLowerCase().split('.').at(-1) ?? '' }
function validateType(name: string, mimeType: string) { if (!(mimeType in supportedExtensions) || !supportedExtensions[mimeType]?.includes(extension(name))) fail(415, 'FILE_TYPE_UNSUPPORTED', 'Định dạng file nguồn không được hỗ trợ.') }
function requireMutation(context: Context) { if (!context.permissions.includes('cost.source.read') || !context.permissions.includes('cost.prepare')) fail(403, 'PERMISSION_DENIED', 'Bạn không có quyền chuẩn bị nguồn.') }
function requireRawRead(context: Context) { if (!context.permissions.includes('cost.source.read') || !context.permissions.includes('cost.file.read')) fail(403, 'PERMISSION_DENIED', 'Bạn không có quyền đọc file nguồn.') }

export function createFileService({ repository, storage, preview }: { repository: Repository; storage: Storage; preview: Preview }) {
  async function file(context: Context, id: string) { const value = await repository.getById(context.companyId, context.tenantId, id); return value ?? fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy file nguồn.') }
  return {
    async createUploadIntent(context: Context, input: unknown) {
      requireMutation(context)
      const value = createFileUploadIntentInputSchema.parse(input)
      validateType(value.originalName, value.mimeType)
      const id = randomUUID()
      const objectKey = `c1-acceptance/${context.requestId}/${id}`
      const created = await repository.createPending({ id, tenantId: context.tenantId, companyId: context.companyId, bucket, objectKey, originalName: value.originalName, uploadedBy: context.actorId })
      return { file: created, uploadUrl: await storage.createUploadUrl(bucket, created.objectKey, { upsert: false }) }
    },
    async finalize(context: Context, id: string) {
      requireMutation(context)
      const existing = await file(context, id)
      if (existing.state !== 'pending') return existing
      const metadata = await storage.getMetadata(existing.bucket, existing.objectKey)
      if (metadata.byteSize > maxSourceFileBytes) fail(413, 'FILE_TOO_LARGE', 'File vượt quá 20 MiB.')
      validateType(existing.originalName, metadata.mimeType)
      if (!/^[a-f0-9]{64}$/i.test(metadata.sha256)) fail(415, 'FILE_TYPE_UNSUPPORTED', 'Không thể xác minh file nguồn.')
      return repository.finalize({ id: existing.id, tenantId: context.tenantId, companyId: context.companyId, byteSize: metadata.byteSize, mimeType: metadata.mimeType, sha256: metadata.sha256, finalizedBy: context.actorId })
    },
    async preview(context: Context, id: string, query: unknown) {
      requireRawRead(context)
      const existing = await file(context, id)
      if (existing.state !== 'ready') fail(409, 'SOURCE_FILE_NOT_READY', 'File nguồn chưa sẵn sàng.')
      if (!storage.getBytes) fail(415, 'FILE_TYPE_UNSUPPORTED', 'Không thể xem trước file nguồn.')
      return preview.preview(await storage.getBytes(existing.bucket, existing.objectKey), filePreviewQuerySchema.parse(query))
    },
    async createReadUrl(context: Context, id: string) {
      requireRawRead(context)
      const existing = await file(context, id)
      if (existing.state !== 'ready') fail(409, 'SOURCE_FILE_NOT_READY', 'File nguồn chưa sẵn sàng.')
      return { ...await storage.createReadUrl(existing.bucket, existing.objectKey, 60), cacheControl: 'private, no-store' }
    },
  }
}
