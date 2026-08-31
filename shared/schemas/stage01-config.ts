import { z } from 'zod'
import { stage01CriterionDefinitionSchema, stage01DimensionSchema } from './stage01'

const uuidSchema = z.string().uuid()
const versionSchema = z.number().int().nonnegative()
const positiveVersionSchema = z.number().int().positive()
const meaningfulTextSchema = z.string().trim().min(1)
const timestampSchema = z.string().datetime({ offset: true })

export const stage01WorkflowKeySchema = z.literal('vqh.stage01')

export const stage01BusinessTaxonomyKeySchema = z.enum([
  'customer_type',
  'contact_relationship',
  'scope',
  'lead_source',
  'referrer_type',
  'engagement_status',
  'invalid_reason',
  'budget_status',
  'timeline_status',
  'priority',
  'intake_channel',
  'blocker_category',
])
export type Stage01BusinessTaxonomyKey = z.infer<typeof stage01BusinessTaxonomyKeySchema>

export const stage01BusinessTaxonomyEntrySchema = z.object({
  code: meaningfulTextSchema,
  label: meaningfulTextSchema,
}).strict()
export type Stage01BusinessTaxonomyEntry = z.infer<typeof stage01BusinessTaxonomyEntrySchema>

export const stage01LeadSourceBusinessTaxonomyEntrySchema = stage01BusinessTaxonomyEntrySchema.extend({
  behavior: z.object({
    requiresReferrer: z.boolean(),
  }).strict().optional(),
}).strict()
export type Stage01LeadSourceBusinessTaxonomyEntry = z.infer<typeof stage01LeadSourceBusinessTaxonomyEntrySchema>

const stage01BusinessTaxonomyEntriesSchema = z.array(stage01BusinessTaxonomyEntrySchema).min(1)

export const stage01BusinessTaxonomiesSchema = z.object({
  customer_type: stage01BusinessTaxonomyEntriesSchema,
  contact_relationship: stage01BusinessTaxonomyEntriesSchema,
  scope: stage01BusinessTaxonomyEntriesSchema,
  lead_source: z.array(stage01LeadSourceBusinessTaxonomyEntrySchema).min(1),
  referrer_type: stage01BusinessTaxonomyEntriesSchema,
  engagement_status: stage01BusinessTaxonomyEntriesSchema,
  invalid_reason: stage01BusinessTaxonomyEntriesSchema,
  budget_status: stage01BusinessTaxonomyEntriesSchema,
  timeline_status: stage01BusinessTaxonomyEntriesSchema,
  priority: stage01BusinessTaxonomyEntriesSchema,
  intake_channel: stage01BusinessTaxonomyEntriesSchema,
  blocker_category: stage01BusinessTaxonomyEntriesSchema,
}).strict().superRefine((taxonomies, context) => {
  for (const [taxonomyKey, entries] of Object.entries(taxonomies)) {
    const codes = new Set<string>()
    for (const [index, entry] of entries.entries()) {
      if (codes.has(entry.code)) {
        context.addIssue({
          code: 'custom',
          path: [taxonomyKey, index, 'code'],
          message: 'Business taxonomy codes must be unique within each taxonomy',
        })
      }
      codes.add(entry.code)
    }
  }
})
export type Stage01BusinessTaxonomies = z.infer<typeof stage01BusinessTaxonomiesSchema>

export const stage01CriteriaSchema = z.array(stage01CriterionDefinitionSchema).min(5).superRefine((criteria, context) => {
  const keys = new Set<string>()
  const dimensions = new Set<string>()

  for (const [index, criterion] of criteria.entries()) {
    if (keys.has(criterion.key)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'key'],
        message: 'Stage 01 criterion keys must be unique',
      })
    }
    keys.add(criterion.key)
    dimensions.add(criterion.dimensionKey)
  }

  for (const dimensionKey of stage01DimensionSchema.options) {
    if (!dimensions.has(dimensionKey)) {
      context.addIssue({
        code: 'custom',
        path: [],
        message: 'Stage 01 criteria must cover every approved dimension',
      })
    }
  }
})
export type Stage01Criteria = z.infer<typeof stage01CriteriaSchema>

export const stage01BusinessConfigSystemSchema = z.object({
  nodes: z.array(z.unknown()),
  dependencies: z.array(z.unknown()),
  dimensions: z.array(stage01DimensionSchema),
  capabilities: z.record(z.string(), z.string()),
  gates: z.unknown(),
}).strict()
export type Stage01BusinessConfigSystem = z.infer<typeof stage01BusinessConfigSystemSchema>

export const stage01PublishedConfigSchema = z.object({
  snapshotId: uuidSchema,
  templateVersion: positiveVersionSchema,
  schemaVersion: positiveVersionSchema,
  definitionHash: meaningfulTextSchema,
  publishedAt: timestampSchema,
  taxonomies: stage01BusinessTaxonomiesSchema,
  criteria: stage01CriteriaSchema,
  system: stage01BusinessConfigSystemSchema,
}).strict()
export type Stage01PublishedConfig = z.infer<typeof stage01PublishedConfigSchema>

export const stage01ConfigDraftSchema = z.object({
  id: uuidSchema,
  baseSnapshotId: uuidSchema,
  version: versionSchema,
  createdBy: uuidSchema,
  createdAt: timestampSchema,
  updatedBy: uuidSchema,
  updatedAt: timestampSchema,
  taxonomies: stage01BusinessTaxonomiesSchema,
  criteria: stage01CriteriaSchema,
}).strict()
export type Stage01ConfigDraft = z.infer<typeof stage01ConfigDraftSchema>

export const stage01BusinessConfigViewSchema = z.object({
  workflowKey: stage01WorkflowKeySchema,
  published: stage01PublishedConfigSchema,
  draft: stage01ConfigDraftSchema.nullable(),
}).strict()
export type Stage01BusinessConfigView = z.infer<typeof stage01BusinessConfigViewSchema>

export const createStage01ConfigDraftInputSchema = z.object({
  expectedPublishedSnapshotId: uuidSchema,
}).strict()
export type CreateStage01ConfigDraftInput = z.infer<typeof createStage01ConfigDraftInputSchema>

export const updateStage01ConfigDraftInputSchema = z.object({
  expectedDraftVersion: versionSchema,
  taxonomies: stage01BusinessTaxonomiesSchema,
  criteria: stage01CriteriaSchema,
}).strict()
export type UpdateStage01ConfigDraftInput = z.infer<typeof updateStage01ConfigDraftInputSchema>

export const discardStage01ConfigDraftInputSchema = z.object({
  expectedDraftVersion: versionSchema,
}).strict()
export type DiscardStage01ConfigDraftInput = z.infer<typeof discardStage01ConfigDraftInputSchema>

export const publishStage01ConfigDraftInputSchema = z.object({
  expectedDraftVersion: versionSchema,
}).strict()
export type PublishStage01ConfigDraftInput = z.infer<typeof publishStage01ConfigDraftInputSchema>

export const publishStage01ConfigResultSchema = z.object({
  snapshotId: uuidSchema,
  templateVersion: positiveVersionSchema,
  schemaVersion: positiveVersionSchema,
  definitionHash: meaningfulTextSchema,
  publishedAt: timestampSchema,
}).strict()
export type PublishStage01ConfigResult = z.infer<typeof publishStage01ConfigResultSchema>
