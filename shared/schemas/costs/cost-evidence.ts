import { z } from 'zod'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u)
const version = z.number().int().nonnegative()
export const COST_EVIDENCE_MAX_BYTES = 25 * 1024 * 1024
export const COST_EVIDENCE_BUCKET_ID = 'c1-accounting-evidence'
export const costEvidenceMimeTypeSchema = z.enum(['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg'])
export const costEvidenceKindSchema = z.enum(['contract', 'acceptance_record', 'invoice', 'accounting_support', 'payment_proof', 'source_file', 'other'])
export const costEvidenceCreateIntentInputSchema = z.object({ originalFilename: z.string().trim().min(1), mimeType: costEvidenceMimeTypeSchema, sizeBytes: z.number().int().positive().max(COST_EVIDENCE_MAX_BYTES), sha256 }).strict()
export const costEvidenceIntentAckSchema = z.object({ evidenceFileId: uuid, version, bucketId: z.literal(COST_EVIDENCE_BUCKET_ID), objectPath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/u), expiresAt: timestamp, replayed: z.boolean() }).strict()
export const costEvidenceUploadIntentSchema = costEvidenceIntentAckSchema.extend({ signedUploadToken: z.string().min(1) }).strict()
export const costEvidenceFinalizeInputSchema = z.object({ expectedVersion: version }).strict()
export const costEvidenceFinalizedSchema = z.object({ id: uuid, status: z.literal('finalized'), originalFilename: z.string().min(1), mimeType: costEvidenceMimeTypeSchema, sizeBytes: z.number().int().positive(), sha256, version, finalizedAt: timestamp, replayed: z.boolean() }).strict()
export const costEvidenceLinkInputSchema = z.object({ evidenceFileId: uuid, evidenceKind: costEvidenceKindSchema, accountingSourceVersionId: uuid.optional() }).strict()
export const costEvidenceLinkResultSchema = z.object({ linkId: uuid, costId: uuid, evidenceFileId: uuid, evidenceKind: costEvidenceKindSchema, replayed: z.boolean() }).strict()
export const costEvidenceMetadataSchema = z.object({ linkId: uuid, evidenceFileId: uuid, evidenceKind: costEvidenceKindSchema, accountingSourceVersionId: uuid.nullable(), originalFilename: z.string().min(1), mimeType: costEvidenceMimeTypeSchema, sizeBytes: z.number().int().positive(), sha256, finalizedAt: timestamp }).strict()
export const costEvidenceReadUrlInputSchema = z.object({ disposition: z.enum(['inline', 'attachment']).optional().default('inline') }).strict()
export const costEvidenceReadUrlSchema = z.object({ url: z.string().url(), expiresAt: timestamp }).strict()

export type CostEvidenceCreateIntentInput = z.infer<typeof costEvidenceCreateIntentInputSchema>
export type CostEvidenceUploadIntent = z.infer<typeof costEvidenceUploadIntentSchema>
export type CostEvidenceFinalizeInput = z.infer<typeof costEvidenceFinalizeInputSchema>
export type CostEvidenceFinalized = z.infer<typeof costEvidenceFinalizedSchema>
export type CostEvidenceLinkInput = z.infer<typeof costEvidenceLinkInputSchema>
export type CostEvidenceLinkResult = z.infer<typeof costEvidenceLinkResultSchema>
export type CostEvidenceMetadata = z.infer<typeof costEvidenceMetadataSchema>
export type CostEvidenceReadUrlInput = z.infer<typeof costEvidenceReadUrlInputSchema>
export type CostEvidenceReadUrl = z.infer<typeof costEvidenceReadUrlSchema>
