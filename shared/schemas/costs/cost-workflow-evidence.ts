import { z } from 'zod'
import { costEvidenceCreateIntentInputSchema, costEvidenceKindSchema } from './cost-evidence'
import { workflowUuidSchema } from './cost-workflow'
export const workflowEvidenceTargetSchema = z.discriminatedUnion('kind', [
 z.object({kind:z.literal('request'),id:workflowUuidSchema.optional()}).strict(),
 z.object({kind:z.literal('payment'),id:workflowUuidSchema}).strict(),
 z.object({kind:z.literal('adjustment'),id:workflowUuidSchema}).strict(),
])
export const workflowEvidenceKindSchema=z.enum([...costEvidenceKindSchema.options,'quotation'])
export const workflowEvidenceIntentSchema = costEvidenceCreateIntentInputSchema.extend({target:workflowEvidenceTargetSchema,evidenceKind:workflowEvidenceKindSchema.optional()}).strict()
export const workflowEvidenceLinkSchema = z.object({expectedVersion:z.number().int().nonnegative(),evidenceFileIds:z.array(workflowUuidSchema).min(1).max(100).refine(ids=>new Set(ids).size===ids.length)}).strict()
export type WorkflowEvidenceIntent = z.infer<typeof workflowEvidenceIntentSchema>
export type WorkflowEvidenceLink = z.infer<typeof workflowEvidenceLinkSchema>
