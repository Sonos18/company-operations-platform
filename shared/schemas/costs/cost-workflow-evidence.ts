import { z } from 'zod'
import { costEvidenceCreateIntentInputSchema, costEvidenceKindSchema } from './cost-evidence'
import { workflowUuidSchema } from './cost-workflow'
import { isoTimestampSchema } from '../iso-timestamp'

export const workflowQuotationRecoveryInputSchema = z.object({
 requestId: workflowUuidSchema.nullable(),
 requestVersion: z.number().int().nonnegative().nullable(),
}).strict().refine(value => (value.requestId === null) === (value.requestVersion === null), 'Request identity and revision must be paired')
export const workflowRecoverableQuotationSchema = z.object({
 id: workflowUuidSchema,
 version: z.number().int().positive(),
 originalFilename: z.string().trim().min(1),
 mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
 sizeBytes: z.number().int().min(1).max(4000000),
 sha256: z.string().regex(/^[a-f0-9]{64}$/u),
 finalizedAt: isoTimestampSchema,
 kind: z.literal('quotation'),
}).strict()
export const workflowRecoverableQuotationsSchema = z.array(workflowRecoverableQuotationSchema).max(20).refine(values => new Set(values.map(value => value.id)).size === values.length, 'Duplicate quotation identity')
export type WorkflowQuotationRecoveryInput = z.infer<typeof workflowQuotationRecoveryInputSchema>
export type WorkflowRecoverableQuotation = z.infer<typeof workflowRecoverableQuotationSchema>
export const workflowEvidenceTargetSchema = z.discriminatedUnion('kind', [
 z.object({kind:z.literal('request'),id:workflowUuidSchema.optional()}).strict(),
 z.object({kind:z.literal('payment'),id:workflowUuidSchema}).strict(),
 z.object({kind:z.literal('adjustment'),id:workflowUuidSchema.optional(),sourcePaymentId:workflowUuidSchema.optional()}).strict().refine(value=>(value.id===undefined)!==(value.sourcePaymentId===undefined),'Exactly one adjustment or source payment identity is required'),
])
export const workflowEvidenceKindSchema=z.enum([...costEvidenceKindSchema.options,'quotation'])
export const workflowEvidenceIntentSchema = costEvidenceCreateIntentInputSchema.extend({target:workflowEvidenceTargetSchema,evidenceKind:workflowEvidenceKindSchema.optional()}).strict()
export const workflowEvidenceLinkSchema = z.object({expectedVersion:z.number().int().nonnegative(),evidenceFileIds:z.array(workflowUuidSchema).min(1).max(100).refine(ids=>new Set(ids).size===ids.length)}).strict()
export type WorkflowEvidenceIntent = z.infer<typeof workflowEvidenceIntentSchema>
export type WorkflowEvidenceLink = z.infer<typeof workflowEvidenceLinkSchema>
