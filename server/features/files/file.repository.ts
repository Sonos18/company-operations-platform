import { z } from 'zod'
import { createHash } from 'node:crypto'
import { fileObjectSchema, type FileObject } from '../../../shared/schemas/files'
import { AppApiError } from '../../utils/api-error'
import type { UserSupabaseClient } from '../../utils/supabase-client'

interface Query { select(columns: string): Query; eq(column: string, value: string): Query; maybeSingle(): Promise<{ data: unknown; error: unknown }> }
interface Client { from(table: 'file_objects'): Query; rpc(name: 'c1_create_file_upload_intent' | 'c1_finalize_file_object', args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }
function fail(): never { throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc file nguồn.') }
function map(value: unknown): FileObject { const parsed = fileObjectSchema.safeParse(value); if (!parsed.success) return fail(); return parsed.data }

export interface FileDataRepository { createPending(input: Record<string, unknown>): Promise<FileObject>; getById(companyId: string, tenantId: string, id: string): Promise<FileObject | null>; finalize(input: Record<string, unknown>): Promise<FileObject> }
interface StorageBucket { createSignedUploadUrl(path: string, options: { upsert: false }): Promise<{ data: { signedUrl: string } | null; error: unknown }>; createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: unknown }>; download(path: string): Promise<{ data: Blob | null; error: unknown }> }
interface StorageClient { storage: { from(bucket: string): StorageBucket } }
export function createSupabaseFileStorage(db: UserSupabaseClient) {
  const storage = db as unknown as StorageClient
  async function download(bucket: string, objectKey: string) { const { data, error } = await storage.storage.from(bucket).download(objectKey); if (error || !data) return fail(); return data }
  return {
    async createUploadUrl(bucket: string, objectKey: string, options: { upsert: false }) { const { data, error } = await storage.storage.from(bucket).createSignedUploadUrl(objectKey, options); if (error || !data) return fail(); return data.signedUrl },
    async getMetadata(bucket: string, objectKey: string) { const file = await download(bucket, objectKey); const bytes = Buffer.from(await file.arrayBuffer()); return { byteSize: bytes.byteLength, mimeType: file.type, sha256: createHash('sha256').update(bytes).digest('hex') } },
    async getBytes(bucket: string, objectKey: string) { return Buffer.from(await (await download(bucket, objectKey)).arrayBuffer()) },
    async createReadUrl(bucket: string, objectKey: string, seconds: number) { const { data, error } = await storage.storage.from(bucket).createSignedUrl(objectKey, seconds); if (error || !data) return fail(); return { url: data.signedUrl, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() } },
  }
}
export function createSupabaseFileRepository(db: UserSupabaseClient): FileDataRepository {
  const client = db as unknown as Client
  async function getById(companyId: string, tenantId: string, id: string) {
    const { data, error } = await client.from('file_objects').select('id, bucket, object_key, original_name, state, preview_state, version, mime_type, byte_size, sha256, finalized_at').eq('tenant_id', tenantId).eq('company_id', companyId).eq('id', id).maybeSingle()
    if (error) return fail()
    if (!data) return null
    const row = z.object({ id: z.string().uuid(), bucket: z.string(), object_key: z.string(), original_name: z.string(), state: z.string(), preview_state: z.string(), version: z.number(), mime_type: z.string().nullable(), byte_size: z.number().nullable(), sha256: z.string().nullable(), finalized_at: z.string().nullable() }).parse(data)
    return map({ id: row.id, bucket: row.bucket, objectKey: row.object_key, originalName: row.original_name, state: row.state, previewState: row.preview_state, version: row.version, ...(row.mime_type ? { mimeType: row.mime_type } : {}), ...(row.byte_size ? { byteSize: row.byte_size } : {}), ...(row.sha256 ? { sha256: row.sha256 } : {}), ...(row.finalized_at ? { finalizedAt: row.finalized_at } : {}) })
  }
  return {
    async createPending(input) { const { data, error } = await client.rpc('c1_create_file_upload_intent', { target_company_id: input.companyId, target_input: input, target_request_id: input.requestId }); if (error) return fail(); return map(data) },
    getById,
    async finalize(input) { const { data, error } = await client.rpc('c1_finalize_file_object', { target_company_id: input.companyId, target_input: input, target_request_id: input.requestId }); if (error) return fail(); return map(data) },
  }
}
