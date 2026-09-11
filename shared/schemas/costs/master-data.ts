import { z } from 'zod'

const uuid = z.string().uuid()
const text = z.string().trim().min(1)
const version = z.number().int().nonnegative()

export const decimalStringSchema = z.string().regex(/^\d{1,16}(?:\.\d{1,4})?$/)
export const projectOriginSchema = z.enum(['legacy_import', 'manual', 'opportunity_conversion'])
export const projectOperationalStateSchema = z.enum(['active', 'completed', 'paused', 'unknown'])
export const engagementExecutionStateSchema = z.enum(['active', 'completed', 'paused', 'unknown'])
export const pricingMethodSchema = z.enum(['time', 'quantity', 'fixed', 'milestone', 'unknown'])

export const createProjectRegisterInputSchema = z.object({
  code: text, name: text, origin: projectOriginSchema, clientDisplayName: text.optional(), locationText: text.optional(),
  operationalState: projectOperationalStateSchema.optional(), sourceOpportunityId: uuid.optional(),
}).strict()
export const updateProjectRegisterInputSchema = createProjectRegisterInputSchema.partial().extend({ expectedVersion: version }).strict()
export const createBusinessPartyInputSchema = z.object({ code: text, displayName: text, partyKind: z.enum(['crew', 'organization']), taxIdentifier: text.optional(), contactDisplayName: text.optional(), contactPhone: text.optional() }).strict()
export const updateBusinessPartyInputSchema = createBusinessPartyInputSchema.partial().extend({ expectedVersion: version }).strict()
export const createEngagementInputSchema = z.object({ partyId: uuid, code: text, name: text, currencyCode: z.string().trim().length(3), executionState: engagementExecutionStateSchema.optional(), initialDataMode: z.enum(['historical_total', 'source_documents']).optional(), contractReference: text.optional() }).strict()
export const updateEngagementInputSchema = createEngagementInputSchema.partial().extend({ expectedVersion: version }).strict()
export const createEngagementComponentInputSchema = z.object({ code: text, name: text, pricingMethod: pricingMethodSchema, unitCode: text.optional() }).strict()
export const updateEngagementComponentInputSchema = createEngagementComponentInputSchema.partial().extend({ expectedVersion: version }).strict()

export type CreateProjectRegisterInput = z.infer<typeof createProjectRegisterInputSchema>
export type UpdateProjectRegisterInput = z.infer<typeof updateProjectRegisterInputSchema>
