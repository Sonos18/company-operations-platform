import Decimal from 'decimal.js'
import { z } from 'zod'
import { decimalStringSchema } from './master-data'

const uuid = z.string().uuid()
const text = z.string().trim().min(1)
const version = z.number().int().nonnegative()
const currencyCode = z.string().trim().length(3)
const relevantDate = z.string().date()
const uniqueSourceFigureIds = z.array(uuid).refine(ids => new Set(ids).size === ids.length, 'source figure IDs must be unique')
const sourceFigureIds = z.array(uuid).min(1).refine(ids => new Set(ids).size === ids.length, 'source figure IDs must be unique')

export const projectCostWorkStatusSchema = z.enum(['unknown', 'in_progress', 'accepted'])
export const projectCostPublicationStateSchema = z.enum(['draft', 'published'])
export const projectCostProjectMetadataSchema = z.object({ projectId: uuid, projectCode: text, projectName: text }).strict()

export const projectCostPublishBlockingCodeSchema = z.enum([
  'FINANCIAL_DETAILS_REQUIRED',
  'SOURCE_NOT_SHARED',
  'SOURCE_REVIEW_BLOCKING',
  'EVIDENCE_NOT_FINALIZED',
  'SUBCONTRACT_COST_MODEL_UNSUPPORTED',
])
export const projectCostPublishReadinessSchema = z.object({ ready: z.boolean(), blockingCodes: z.array(projectCostPublishBlockingCodeSchema) }).strict()
export const costCommandAckSchema = z.object({ id: uuid, version, publicationState: projectCostPublicationStateSchema, replayed: z.boolean() }).strict()
export const publishProjectCostInputSchema = z.object({ expectedVersion: version }).strict()

export const createProjectCostDraftInputSchema = z.object({
  projectId: uuid,
  description: text,
  costCategoryId: uuid,
  businessReference: text.optional(),
  partyId: uuid.optional(),
  engagementId: uuid.optional(),
  componentId: uuid.optional(),
  relevantDate: relevantDate.optional(),
  workStatus: projectCostWorkStatusSchema.optional(),
}).strict()

export const updateProjectCostDraftInputSchema = z.object({
  expectedVersion: version,
  description: text.optional(),
  costCategoryId: uuid.optional(),
  businessReference: text.nullable().optional(),
  partyId: uuid.nullable().optional(),
  engagementId: uuid.nullable().optional(),
  componentId: uuid.nullable().optional(),
  relevantDate: relevantDate.nullable().optional(),
  workStatus: projectCostWorkStatusSchema.optional(),
}).strict().superRefine((value, context) => {
  if (!['description', 'costCategoryId', 'businessReference', 'partyId', 'engagementId', 'componentId', 'relevantDate', 'workStatus'].some(field => Object.hasOwn(value, field))) context.addIssue({ code: 'custom', message: 'requires a mutable field' })
})

const projectCostItemFieldsSchema = z.object({
  description: text,
  amount: decimalStringSchema,
  currencyCode,
  workStatus: projectCostWorkStatusSchema,
  businessReference: text.nullable().optional(),
  partyId: uuid.optional(),
  engagementId: uuid.optional(),
  componentId: uuid.optional(),
  relevantDate: relevantDate.optional(),
})

export const createProjectCostItemInputSchema = projectCostItemFieldsSchema.extend({
  projectId: uuid,
  nonOverlapConfirmationReference: text,
  sourceFigureIds: sourceFigureIds.optional(),
}).strict()

export const updateProjectCostItemInputSchema = z.object({
  description: text.optional(),
  partyId: uuid.nullable().optional(),
  engagementId: uuid.nullable().optional(),
  componentId: uuid.nullable().optional(),
  relevantDate: relevantDate.nullable().optional(),
  workStatus: projectCostWorkStatusSchema.optional(),
  expectedVersion: version,
}).strict().superRefine((value, context) => {
  if (!['description', 'partyId', 'engagementId', 'componentId', 'relevantDate', 'workStatus'].some(field => Object.hasOwn(value, field))) {
    context.addIssue({ code: 'custom', message: 'requires a mutable field' })
  }
})

export const correctProjectCostItemInputSchema = z.object({
  expectedVersion: version,
  reason: text,
  amount: decimalStringSchema.optional(),
  workStatus: projectCostWorkStatusSchema.optional(),
}).strict().superRefine((value, context) => {
  if (!['amount', 'workStatus'].some(field => Object.hasOwn(value, field))) {
    context.addIssue({ code: 'custom', message: 'requires a material correction field' })
  }
})

const timestamp = z.string().datetime({ offset: true })
export const projectCostItemSchema = z.object({
  id: uuid,
  tenantId: uuid,
  companyId: uuid,
  projectId: uuid,
  description: text,
  amount: decimalStringSchema,
  currencyCode,
  workStatus: projectCostWorkStatusSchema,
  businessReference: text.nullable(),
  partyId: uuid.nullable(),
  engagementId: uuid.nullable(),
  componentId: uuid.nullable(),
  relevantDate: relevantDate.nullable(),
  version,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()

export const projectCostSummarySchema = z.object({
  currencyCode,
  acceptedValue: decimalStringSchema,
  acceptedCount: z.number().int().nonnegative(),
  inProgressValue: decimalStringSchema,
  inProgressCount: z.number().int().nonnegative(),
  unknownStatusValue: decimalStringSchema,
  unknownCount: z.number().int().nonnegative(),
  totalTrackedWorkValue: decimalStringSchema,
}).strict().superRefine((value, context) => {
  if (!new Decimal(value.acceptedValue).plus(value.inProgressValue).eq(value.totalTrackedWorkValue)) {
    context.addIssue({ code: 'custom', path: ['totalTrackedWorkValue'], message: 'must equal acceptedValue plus inProgressValue' })
  }
})

export const projectCostSummaryEntrySchema = projectCostProjectMetadataSchema.extend({
  summary: projectCostSummarySchema,
}).strict()

export const projectCostBreakdownSchema = projectCostProjectMetadataSchema.extend({ summary: projectCostSummarySchema, items: z.array(projectCostItemSchema) }).strict()

export const projectCostDetailKindSchema = z.enum(['opening_balance', 'line_item'])
export const projectCostRetentionKindSchema = z.enum(['warranty', 'other'])

function validateRetention(val: { amount: string, retentionKind: 'warranty' | 'other' | null, retentionRateBps: number | null, retentionAmount: string | null }, ctx: z.RefinementCtx) {
  const hasKind = val.retentionKind !== null
  const hasAmount = val.retentionAmount !== null
  const hasRate = val.retentionRateBps !== null
  if (!hasKind && !hasAmount) {
    if (hasRate) ctx.addIssue({ code: 'custom', path: ['retentionRateBps'], message: 'retentionRateBps must be null when retention is not present' })
    return
  }
  if (!hasKind) ctx.addIssue({ code: 'custom', path: ['retentionKind'], message: 'retentionKind must be non-null when retention is present' })
  if (!hasAmount) ctx.addIssue({ code: 'custom', path: ['retentionAmount'], message: 'retentionAmount must be non-null when retention is present' })
  if (val.retentionAmount !== null && new Decimal(val.retentionAmount).greaterThan(new Decimal(val.amount))) ctx.addIssue({ code: 'custom', path: ['retentionAmount'], message: 'retentionAmount cannot be greater than detail amount' })
}

export const prepareProjectCostFinancialDetailInputSchema = z.object({
  lineNo: z.number().int().positive(),
  detailKind: projectCostDetailKindSchema,
  description: text,
  quantity: decimalStringSchema.nullable().optional(),
  unitCode: z.string().nullable().optional(),
  unitPrice: decimalStringSchema.nullable().optional(),
  amount: decimalStringSchema,
  retentionKind: projectCostRetentionKindSchema.nullable().optional().default(null),
  retentionRateBps: z.number().int().min(0).max(10000).nullable().optional().default(null),
  retentionAmount: decimalStringSchema.nullable().optional().default(null),
  relevantDate: relevantDate.nullable().optional(),
  reference: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
}).strict().superRefine(validateRetention)

export const prepareProjectCostFinancialsInputSchema = z.object({
  expectedVersion: version,
  currencyCode,
  details: z.array(prepareProjectCostFinancialDetailInputSchema).min(1),
  sourceFigureIds: uniqueSourceFigureIds,
}).strict()
export const prepareProjectCostFinancialsResultSchema = z.object({
  id: uuid,
  version,
  publicationState: z.literal('draft'),
  amount: decimalStringSchema,
  detailCount: z.number().int().positive(),
  publishReadiness: projectCostPublishReadinessSchema,
  replayed: z.boolean(),
}).strict()

const projectCostCorrectionOperationalChangesSchema = z.object({
  description: text.optional(), costCategoryId: uuid.optional(), businessReference: text.nullable().optional(),
  partyId: uuid.nullable().optional(), engagementId: uuid.nullable().optional(), componentId: uuid.nullable().optional(),
  relevantDate: relevantDate.nullable().optional(), workStatus: projectCostWorkStatusSchema.optional(),
}).strict().superRefine((value, context) => {
  if (Object.keys(value).length === 0) context.addIssue({ code: 'custom', message: 'requires an operational change' })
})
const projectCostCorrectionFinancialChangesSchema = z.object({ currencyCode, details: z.array(prepareProjectCostFinancialDetailInputSchema).min(1), sourceFigureIds: uniqueSourceFigureIds }).strict()
export const correctPublishedProjectCostInputSchema = z.object({
  expectedVersion: version,
  reason: text,
  operationalChanges: projectCostCorrectionOperationalChangesSchema.optional(),
  financialChanges: projectCostCorrectionFinancialChangesSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.operationalChanges === undefined && value.financialChanges === undefined) context.addIssue({ code: 'custom', message: 'requires correction changes' })
})

export const projectCostItemDetailSchema = z.object({
  id: uuid,
  projectCostItemId: uuid,
  lineNo: z.number().int().positive(),
  detailKind: projectCostDetailKindSchema,
  description: text,
  quantity: decimalStringSchema.nullable(),
  unitCode: z.string().nullable(),
  unitPrice: decimalStringSchema.nullable(),
  amount: decimalStringSchema,
  retentionKind: projectCostRetentionKindSchema.nullable(),
  retentionRateBps: z.number().int().min(0).max(10000).nullable(),
  retentionAmount: decimalStringSchema.nullable(),
  relevantDate: relevantDate.nullable(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  version,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict().superRefine(validateRetention)

export const projectCostDetailsResponseSchema = z.object({
  projectCostItemId: uuid,
  totalAmount: decimalStringSchema,
  currencyCode,
  details: z.array(projectCostItemDetailSchema),
}).strict()

export const projectCostDraftSchema = z.object({
  id: uuid,
  projectId: uuid,
  description: text,
  costCategoryId: uuid,
  businessReference: text.nullable(),
  partyId: uuid.nullable(),
  engagementId: uuid.nullable(),
  componentId: uuid.nullable(),
  relevantDate: relevantDate.nullable(),
  workStatus: projectCostWorkStatusSchema,
  amount: decimalStringSchema.nullable(),
  currencyCode,
  publicationState: z.literal('draft'),
  version,
  details: z.array(projectCostItemDetailSchema),
  sourceFigureIds: uniqueSourceFigureIds,
  publishReadiness: projectCostPublishReadinessSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()

export type ProjectCostWorkStatus = z.infer<typeof projectCostWorkStatusSchema>
export type ProjectCostPublicationState = z.infer<typeof projectCostPublicationStateSchema>
export type ProjectCostPublishBlockingCode = z.infer<typeof projectCostPublishBlockingCodeSchema>
export type ProjectCostPublishReadiness = z.infer<typeof projectCostPublishReadinessSchema>
export type CostCommandAck = z.infer<typeof costCommandAckSchema>
export type PublishProjectCostInput = z.infer<typeof publishProjectCostInputSchema>
export type CreateProjectCostDraftInput = z.infer<typeof createProjectCostDraftInputSchema>
export type UpdateProjectCostDraftInput = z.infer<typeof updateProjectCostDraftInputSchema>
export type PrepareProjectCostFinancialDetailInput = z.infer<typeof prepareProjectCostFinancialDetailInputSchema>
export type PrepareProjectCostFinancialsInput = z.infer<typeof prepareProjectCostFinancialsInputSchema>
export type PrepareProjectCostFinancialsResult = z.infer<typeof prepareProjectCostFinancialsResultSchema>
export type CorrectPublishedProjectCostInput = z.infer<typeof correctPublishedProjectCostInputSchema>
export type ProjectCostDraft = z.infer<typeof projectCostDraftSchema>
export type CreateProjectCostItemInput = z.infer<typeof createProjectCostItemInputSchema>
export type UpdateProjectCostItemInput = z.infer<typeof updateProjectCostItemInputSchema>
export type CorrectProjectCostItemInput = z.infer<typeof correctProjectCostItemInputSchema>
export type ProjectCostItem = z.infer<typeof projectCostItemSchema>
export type ProjectCostSummary = z.infer<typeof projectCostSummarySchema>
export type ProjectCostSummaryEntry = z.infer<typeof projectCostSummaryEntrySchema>
export type ProjectCostBreakdown = z.infer<typeof projectCostBreakdownSchema>
export type ProjectCostDetailKind = z.infer<typeof projectCostDetailKindSchema>
export type ProjectCostRetentionKind = z.infer<typeof projectCostRetentionKindSchema>
export type ProjectCostItemDetail = z.infer<typeof projectCostItemDetailSchema>
export type ProjectCostDetailsResponse = z.infer<typeof projectCostDetailsResponseSchema>
