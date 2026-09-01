import { z } from 'zod'
import { contactSchema } from './opportunities'
import { stage01BusinessTaxonomiesSchema, stage01CriteriaSchema } from './stage01-config'
import { stage01DecisionCycleSchema, stage01DetailSchema } from './stage01'

export const stage01OperationalDetailSchema = stage01DetailSchema.extend({
  configuration: z.object({
    taxonomies: stage01BusinessTaxonomiesSchema,
    criteria: stage01CriteriaSchema,
  }).strict(),
  relatedContacts: z.array(contactSchema),
  decisionCycles: z.array(stage01DecisionCycleSchema).min(1),
}).strict().superRefine((value, context) => {
  const latest = value.decisionCycles[value.decisionCycles.length - 1]
  if (!latest || latest.id !== value.currentDecisionCycle.id) {
    context.addIssue({ code: 'custom', path: ['decisionCycles'], message: 'Current decision cycle must be the latest cycle' })
  }
})

export type Stage01OperationalDetail = z.infer<typeof stage01OperationalDetailSchema>
