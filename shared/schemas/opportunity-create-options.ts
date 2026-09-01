import { z } from 'zod'

const uuidSchema = z.string().uuid()
const textSchema = z.string().trim().min(1)
const taxonomyEntrySchema = z.object({
  code: textSchema,
  label: textSchema,
}).strict()
const leadSourceEntrySchema = taxonomyEntrySchema.extend({
  behavior: z.object({ requiresReferrer: z.boolean() }).strict(),
}).strict()

export const opportunityCreateOptionsSchema = z.object({
  workflowKey: z.literal('vqh.stage01'),
  publishedSnapshotId: uuidSchema,
  taxonomies: z.object({
    customer_type: z.array(taxonomyEntrySchema),
    lead_source: z.array(leadSourceEntrySchema),
    engagement_status: z.array(taxonomyEntrySchema),
    budget_status: z.array(taxonomyEntrySchema),
    timeline_status: z.array(taxonomyEntrySchema),
    priority: z.array(taxonomyEntrySchema),
  }).strict(),
}).strict()

export type OpportunityCreateOptions = z.infer<typeof opportunityCreateOptionsSchema>
