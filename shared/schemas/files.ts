import { z } from 'zod'

const uuid = z.string().uuid()
const timestamp = z.string().datetime()
const text = z.string().trim().min(1)

export const maxSourceFileBytes = 20 * 1024 * 1024
export const sourceFileStateSchema = z.enum(['pending', 'ready', 'rejected', 'abandoned'])
export const filePreviewStateSchema = z.enum(['available', 'limited', 'unsupported', 'failed'])
export const supportedSourceMimeTypeSchema = z.enum([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/pdf',
  'image/png',
  'image/jpeg',
])
export const createFileUploadIntentInputSchema = z.object({ originalName: text.max(255), mimeType: supportedSourceMimeTypeSchema }).strict()
export const filePreviewQuerySchema = z.object({ sheet: z.string().max(255).optional(), offset: z.number().int().min(0).optional(), maxRows: z.number().int().min(1).max(200).optional(), maxColumns: z.number().int().min(1).max(50).optional() }).strict()
export const fileObjectSchema = z.object({
  id: uuid, bucket: text, objectKey: text, originalName: text, state: sourceFileStateSchema, previewState: filePreviewStateSchema, version: z.number().int().nonnegative(),
  mimeType: supportedSourceMimeTypeSchema.optional(), byteSize: z.number().int().positive().max(maxSourceFileBytes).optional(), sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(), finalizedAt: timestamp.optional(),
}).strict()
export type CreateFileUploadIntentInput = z.infer<typeof createFileUploadIntentInputSchema>
export type FilePreviewQuery = z.infer<typeof filePreviewQuerySchema>
export type FileObject = z.infer<typeof fileObjectSchema>
