import { z } from 'zod'

const uuidSchema = z.string().uuid()
const versionSchema = z.number().int().nonnegative()
const meaningfulTextSchema = z.string().trim().min(1)
const timestampSchema = z.string().datetime({ offset: true })
const nullableTextSchema = meaningfulTextSchema.nullable()

export const reliabilityStateSchema = z.enum(['unverified', 'confirmed', 'disputed'])
export type ReliabilityState = z.infer<typeof reliabilityStateSchema>
export const opportunityValidityStateSchema = z.enum(['valid', 'invalid'])
export const opportunityLocationStatusSchema = z.enum(['unknown', 'area_known', 'relative', 'exact'])
export const contactMethodTypeSchema = z.enum(['phone', 'email', 'other'])
export const duplicateResolutionSchema = z.enum(['same_need', 'different_need'])

const opportunityCurrentFields = {
  primaryCustomerName: nullableTextSchema,
  customerTypeCode: nullableTextSchema,
  needDescription: nullableTextSchema,
  locationStatus: opportunityLocationStatusSchema,
  locationText: nullableTextSchema,
  primaryLeadSourceCode: nullableTextSchema,
  engagementStatusCode: nullableTextSchema,
  budgetStatusCode: nullableTextSchema,
  budgetMin: z.number().nonnegative().nullable(),
  budgetMax: z.number().nonnegative().nullable(),
  currencyCode: z.string().trim().length(3).nullable(),
  budgetNote: nullableTextSchema,
  timelineStatusCode: nullableTextSchema,
  timelineStartDate: z.string().date().nullable(),
  timelineEndDate: z.string().date().nullable(),
  timelineNote: nullableTextSchema,
  priorityCode: nullableTextSchema,
}

export const opportunitySummarySchema = z.object({
  id: uuidSchema,
  validityState: opportunityValidityStateSchema,
  canonicalOpportunityId: uuidSchema.nullable(),
  primaryCustomerName: nullableTextSchema,
  needDescription: nullableTextSchema,
  version: versionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict()
export type OpportunitySummary = z.infer<typeof opportunitySummarySchema>

export const contactMethodSchema = z.object({
  id: uuidSchema,
  contactId: uuidSchema,
  methodType: contactMethodTypeSchema,
  value: meaningfulTextSchema,
  isUsable: z.boolean(),
  reliabilityState: reliabilityStateSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict()
export type ContactMethod = z.infer<typeof contactMethodSchema>

export const contactSchema = z.object({
  id: uuidSchema,
  displayName: meaningfulTextSchema,
  notes: nullableTextSchema,
  version: versionSchema,
  methods: z.array(contactMethodSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict()
export type Contact = z.infer<typeof contactSchema>

export const opportunityContactSchema = z.object({
  id: uuidSchema,
  opportunityId: uuidSchema,
  contactId: uuidSchema,
  relationshipCode: meaningfulTextSchema,
  isPrimary: z.boolean(),
  reliabilityState: reliabilityStateSchema.nullable(),
  createdAt: timestampSchema,
  endedAt: timestampSchema.nullable(),
  endReason: nullableTextSchema,
}).strict()
export type OpportunityContact = z.infer<typeof opportunityContactSchema>

export const opportunityScopeSchema = z.object({
  id: uuidSchema,
  opportunityId: uuidSchema,
  scopeCode: meaningfulTextSchema,
  note: nullableTextSchema,
  reliabilityState: reliabilityStateSchema.nullable(),
  createdAt: timestampSchema,
  retiredAt: timestampSchema.nullable(),
  retireReason: nullableTextSchema,
}).strict()
export type OpportunityScope = z.infer<typeof opportunityScopeSchema>

export const opportunityReferrerSchema = z.object({
  id: uuidSchema,
  opportunityId: uuidSchema,
  referrerTypeCode: meaningfulTextSchema,
  displayName: meaningfulTextSchema,
  contactId: uuidSchema.nullable(),
  note: nullableTextSchema,
  reliabilityState: reliabilityStateSchema.nullable(),
  isPrimary: z.boolean(),
  createdAt: timestampSchema,
  endedAt: timestampSchema.nullable(),
  endReason: nullableTextSchema,
}).strict()
export type OpportunityReferrer = z.infer<typeof opportunityReferrerSchema>

export const intakeRecordSchema = z.object({
  id: uuidSchema,
  opportunityId: uuidSchema,
  channelCode: meaningfulTextSchema,
  summary: meaningfulTextSchema,
  correctionOfRecordId: uuidSchema.nullable(),
  correctionReason: nullableTextSchema,
  createdAt: timestampSchema,
}).strict()
export type IntakeRecord = z.infer<typeof intakeRecordSchema>

export const duplicateConcernSchema = z.object({
  id: uuidSchema,
  opportunityId: uuidSchema,
  suspectedDuplicateOpportunityId: uuidSchema.nullable(),
  description: meaningfulTextSchema,
  resolution: duplicateResolutionSchema.nullable(),
  canonicalOpportunityId: uuidSchema.nullable(),
  resolutionNote: nullableTextSchema,
  raisedAt: timestampSchema,
  resolvedAt: timestampSchema.nullable(),
}).strict()
export type DuplicateConcern = z.infer<typeof duplicateConcernSchema>

export const opportunityDetailSchema = z.object({
  id: uuidSchema,
  validityState: opportunityValidityStateSchema,
  canonicalOpportunityId: uuidSchema.nullable(),
  ...opportunityCurrentFields,
  version: versionSchema,
  contacts: z.array(opportunityContactSchema),
  scopes: z.array(opportunityScopeSchema),
  referrers: z.array(opportunityReferrerSchema),
  intakeRecords: z.array(intakeRecordSchema),
  duplicateConcerns: z.array(duplicateConcernSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict()
export type OpportunityDetail = z.infer<typeof opportunityDetailSchema>

export const createStage01OpportunityResultSchema = z.object({
  opportunityId: uuidSchema,
  workflowInstanceId: uuidSchema,
  intakeNodeInstanceId: uuidSchema,
  intakeExecutionId: uuidSchema,
  evaluationNodeInstanceId: uuidSchema,
  evaluationExecutionId: uuidSchema,
  decisionCycleId: uuidSchema,
  opportunityVersion: versionSchema,
  intakeExecutionVersion: versionSchema,
  evaluationExecutionVersion: versionSchema,
  decisionCycleVersion: versionSchema,
}).strict()
export type CreateStage01OpportunityResult = z.infer<typeof createStage01OpportunityResultSchema>

export const createOpportunityInputSchema = z.object({
  primaryCustomerName: meaningfulTextSchema,
  customerTypeCode: meaningfulTextSchema.optional(),
  needDescription: meaningfulTextSchema.optional(),
  locationStatus: opportunityLocationStatusSchema.optional(),
  locationText: meaningfulTextSchema.optional(),
  primaryLeadSourceCode: meaningfulTextSchema.optional(),
  engagementStatusCode: meaningfulTextSchema.optional(),
  budgetStatusCode: meaningfulTextSchema.optional(),
  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(),
  currencyCode: z.string().trim().length(3).optional(),
  budgetNote: meaningfulTextSchema.optional(),
  timelineStatusCode: meaningfulTextSchema.optional(),
  timelineStartDate: z.string().date().optional(),
  timelineEndDate: z.string().date().optional(),
  timelineNote: meaningfulTextSchema.optional(),
  priorityCode: meaningfulTextSchema.optional(),
}).strict()
export type CreateOpportunityInput = z.infer<typeof createOpportunityInputSchema>

export const updateOpportunityInputSchema = createOpportunityInputSchema.partial().extend({
  expectedOpportunityVersion: versionSchema,
}).strict()
export type UpdateOpportunityInput = z.infer<typeof updateOpportunityInputSchema>

export const createContactInputSchema = z.object({
  displayName: meaningfulTextSchema,
  notes: meaningfulTextSchema.optional(),
}).strict()
export type CreateContactInput = z.infer<typeof createContactInputSchema>

export const updateContactInputSchema = z.object({
  displayName: meaningfulTextSchema.optional(),
  notes: meaningfulTextSchema.nullable().optional(),
  expectedContactVersion: versionSchema,
}).strict()
export type UpdateContactInput = z.infer<typeof updateContactInputSchema>

export const addContactMethodInputSchema = z.object({
  methodType: contactMethodTypeSchema,
  value: meaningfulTextSchema,
  isUsable: z.boolean(),
  reliabilityState: reliabilityStateSchema.nullable().optional(),
  expectedContactVersion: versionSchema,
}).strict()
export type AddContactMethodInput = z.infer<typeof addContactMethodInputSchema>

export const updateContactMethodInputSchema = addContactMethodInputSchema.partial().extend({
  expectedContactVersion: versionSchema,
}).strict()
export type UpdateContactMethodInput = z.infer<typeof updateContactMethodInputSchema>

const opportunityRelationshipInputFields = {
  contactId: uuidSchema,
  relationshipCode: meaningfulTextSchema,
  reliabilityState: reliabilityStateSchema.nullable().optional(),
  expectedOpportunityVersion: versionSchema,
}
export const linkOpportunityContactInputSchema = z.object({
  ...opportunityRelationshipInputFields,
  isPrimary: z.boolean().optional(),
}).strict()
export type LinkOpportunityContactInput = z.infer<typeof linkOpportunityContactInputSchema>
export const setPrimaryContactInputSchema = z.object(opportunityRelationshipInputFields).strict()
export type SetPrimaryContactInput = z.infer<typeof setPrimaryContactInputSchema>

export const endOpportunityContactInputSchema = z.object({
  endReason: meaningfulTextSchema,
  expectedOpportunityVersion: versionSchema,
}).strict()
export type EndOpportunityContactInput = z.infer<typeof endOpportunityContactInputSchema>

export const addOpportunityScopeInputSchema = z.object({
  scopeCode: meaningfulTextSchema,
  note: meaningfulTextSchema.optional(),
  reliabilityState: reliabilityStateSchema.nullable().optional(),
  expectedOpportunityVersion: versionSchema,
}).strict()
export type AddOpportunityScopeInput = z.infer<typeof addOpportunityScopeInputSchema>

export const retireOpportunityScopeInputSchema = z.object({
  retireReason: meaningfulTextSchema,
  expectedOpportunityVersion: versionSchema,
}).strict()
export type RetireOpportunityScopeInput = z.infer<typeof retireOpportunityScopeInputSchema>

const referrerInputFields = {
  referrerTypeCode: meaningfulTextSchema,
  displayName: meaningfulTextSchema,
  contactId: uuidSchema.nullable().optional(),
  note: meaningfulTextSchema.optional(),
  reliabilityState: reliabilityStateSchema.nullable().optional(),
  expectedOpportunityVersion: versionSchema,
}
export const addOpportunityReferrerInputSchema = z.object({
  ...referrerInputFields,
  isPrimary: z.boolean().optional(),
}).strict()
export type AddOpportunityReferrerInput = z.infer<typeof addOpportunityReferrerInputSchema>
export const setPrimaryReferrerInputSchema = z.object(referrerInputFields).strict()
export type SetPrimaryReferrerInput = z.infer<typeof setPrimaryReferrerInputSchema>

export const endOpportunityReferrerInputSchema = z.object({
  endReason: meaningfulTextSchema,
  expectedOpportunityVersion: versionSchema,
}).strict()
export type EndOpportunityReferrerInput = z.infer<typeof endOpportunityReferrerInputSchema>

export const appendIntakeRecordInputSchema = z.object({
  channelCode: meaningfulTextSchema,
  summary: meaningfulTextSchema,
  expectedOpportunityVersion: versionSchema,
}).strict()
export type AppendIntakeRecordInput = z.infer<typeof appendIntakeRecordInputSchema>

export const correctIntakeRecordInputSchema = z.object({
  channelCode: meaningfulTextSchema,
  summary: meaningfulTextSchema,
  correctionReason: meaningfulTextSchema,
  expectedOpportunityVersion: versionSchema,
}).strict()
export type CorrectIntakeRecordInput = z.infer<typeof correctIntakeRecordInputSchema>

export const raiseDuplicateConcernInputSchema = z.object({
  suspectedDuplicateOpportunityId: uuidSchema.nullable().optional(),
  description: meaningfulTextSchema,
  expectedOpportunityVersion: versionSchema,
}).strict()
export type RaiseDuplicateConcernInput = z.infer<typeof raiseDuplicateConcernInputSchema>

export const resolveDuplicateConcernInputSchema = z.object({
  resolution: duplicateResolutionSchema,
  canonicalOpportunityId: uuidSchema.nullable().optional(),
  resolutionNote: meaningfulTextSchema,
  expectedOpportunityVersion: versionSchema,
}).strict().superRefine((value, context) => {
  if (value.resolution === 'same_need' && !value.canonicalOpportunityId) {
    context.addIssue({ code: 'custom', path: ['canonicalOpportunityId'], message: 'Canonical Opportunity is required' })
  }
})
export type ResolveDuplicateConcernInput = z.infer<typeof resolveDuplicateConcernInputSchema>

export const invalidateOpportunityInputSchema = z.object({
  invalidReasonCode: meaningfulTextSchema,
  reason: meaningfulTextSchema,
  canonicalOpportunityId: uuidSchema.nullable().optional(),
  expectedOpportunityVersion: versionSchema,
}).strict()
export type InvalidateOpportunityInput = z.infer<typeof invalidateOpportunityInputSchema>

export const restoreOpportunityInputSchema = z.object({
  reason: meaningfulTextSchema,
  expectedOpportunityVersion: versionSchema,
}).strict()
export type RestoreOpportunityInput = z.infer<typeof restoreOpportunityInputSchema>
