import Decimal from 'decimal.js'
import { z } from 'zod'
import { decimalStringSchema } from './master-data'

const uuid = z.string().uuid()
const text = z.string().trim().min(1)
const version = z.number().int().nonnegative()
const currencyCode = z.string().trim().length(3)
const relevantDate = z.string().date()
const uniqueSourceFigureIds = z.array(uuid).refine(ids => new Set(ids).size === ids.length, 'source figure IDs must be unique')

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

function validateRetentionCorrectionPatch(value: {
  amount?: string
  retentionKind?: 'warranty' | 'other' | null
  retentionRateBps?: number | null
  retentionAmount?: string | null
}, context: z.RefinementCtx) {
  const hasKind = Object.hasOwn(value, 'retentionKind')
  const hasRate = Object.hasOwn(value, 'retentionRateBps')
  const hasRetentionAmount = Object.hasOwn(value, 'retentionAmount')
  if (!hasKind && !hasRate && !hasRetentionAmount) return

  const fullClear = hasKind && value.retentionKind === null
    && hasRate && value.retentionRateBps === null
    && hasRetentionAmount && value.retentionAmount === null
  if (hasKind && value.retentionKind === null) {
    if (!fullClear) context.addIssue({ code: 'custom', path: ['retentionKind'], message: 'clearing retention requires all retention fields to be null' })
    return
  }
  if (hasKind && value.retentionKind !== null && value.retentionKind !== undefined && hasRetentionAmount && value.retentionAmount === null) {
    context.addIssue({ code: 'custom', path: ['retentionAmount'], message: 'retentionAmount must be non-null when retentionKind is supplied' })
  }
  if (Object.hasOwn(value, 'amount') && value.amount !== undefined
    && hasRetentionAmount && value.retentionAmount !== null && value.retentionAmount !== undefined
    && new Decimal(value.retentionAmount).greaterThan(new Decimal(value.amount))) {
    context.addIssue({ code: 'custom', path: ['retentionAmount'], message: 'retentionAmount cannot be greater than detail amount' })
  }
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

export const projectCostDraftManagementMetadataSchema = z.object({
  projects: z.array(z.object({ id: uuid, code: text, name: text }).strict()),
  categories: z.array(z.object({ categoryId: uuid, code: text, name: text, isActive: z.boolean(), draftEligible: z.boolean(), postingStrategy: z.enum(['ordinary_detail', 'subcontract_payment']) }).strict()),
}).strict()

export const createProjectCostDetailDraftInputSchema = z.object({
  categoryId: uuid,
  description: text,
  relevantDate: relevantDate.optional(),
  reference: z.string().trim().min(1).optional(),
  note: z.string().trim().min(1).optional(),
}).strict()

export const updateProjectCostDetailDraftInputSchema = z.object({
  expectedVersion: version,
  description: text.optional(),
  relevantDate: relevantDate.nullable().optional(),
  reference: z.string().trim().min(1).nullable().optional(),
  note: z.string().trim().min(1).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (!['description', 'relevantDate', 'reference', 'note'].some(field => Object.hasOwn(value, field))) context.addIssue({ code: 'custom', message: 'requires a mutable field' })
})

export const prepareProjectCostDetailFinancialsInputSchema = z.object({
  expectedVersion: version,
  quantity: decimalStringSchema.nullable().optional().default(null),
  unitCode: z.string().trim().min(1).nullable().optional().default(null),
  unitPrice: decimalStringSchema.nullable().optional().default(null),
  amount: decimalStringSchema,
  retentionKind: projectCostRetentionKindSchema.nullable().optional().default(null),
  retentionRateBps: z.number().int().min(0).max(10000).nullable().optional().default(null),
  retentionAmount: decimalStringSchema.nullable().optional().default(null),
  sourceFigureIds: uniqueSourceFigureIds.optional(),
}).strict().superRefine(validateRetention)

export const publishProjectCostDetailInputSchema = z.object({ expectedVersion: version }).strict()

export const createAndPublishProjectCostDetailInputSchema = z.object({
  categoryId: uuid,
  description: text,
  quantity: decimalStringSchema.nullable().optional().default(null),
  unitCode: z.string().trim().min(1).nullable().optional().default(null),
  unitPrice: decimalStringSchema.nullable().optional().default(null),
  amount: decimalStringSchema,
  retentionKind: projectCostRetentionKindSchema.nullable().optional().default(null),
  retentionRateBps: z.number().int().min(0).max(10000).nullable().optional().default(null),
  retentionAmount: decimalStringSchema.nullable().optional().default(null),
  relevantDate: relevantDate.optional(),
  reference: z.string().trim().min(1).optional(),
  note: z.string().trim().min(1).optional(),
  sourceFigureIds: uniqueSourceFigureIds.optional(),
}).strict().superRefine(validateRetention)

export const correctPublishedProjectCostDetailInputSchema = z.object({
  expectedVersion: version,
  reason: text,
  changes: z.object({
    description: text.optional(),
    relevantDate: relevantDate.nullable().optional(),
    reference: z.string().trim().min(1).nullable().optional(),
    note: z.string().trim().min(1).nullable().optional(),
    quantity: decimalStringSchema.nullable().optional(),
    unitCode: z.string().trim().min(1).nullable().optional(),
    unitPrice: decimalStringSchema.nullable().optional(),
    amount: decimalStringSchema.optional(),
    retentionKind: projectCostRetentionKindSchema.nullable().optional(),
    retentionRateBps: z.number().int().min(0).max(10000).nullable().optional(),
    retentionAmount: decimalStringSchema.nullable().optional(),
    sourceFigureIds: uniqueSourceFigureIds.optional(),
  }).strict().superRefine((value, context) => {
    if (Object.keys(value).length === 0) context.addIssue({ code: 'custom', message: 'requires a correction change' })
    if (Object.values(value).some(field => field === undefined)) context.addIssue({ code: 'custom', message: 'correction fields cannot be undefined' })
    validateRetentionCorrectionPatch(value, context)
  }),
}).strict()

export const projectCostDetailCommandAckSchema = z.object({
  id: uuid,
  projectCostItemId: uuid,
  publicationState: projectCostPublicationStateSchema,
  version,
  replayed: z.boolean(),
}).strict()

export const projectCostDetailDraftSchema = z.object({
  id: uuid,
  projectCostItemId: uuid,
  projectId: uuid,
  categoryId: uuid,
  lineNo: z.number().int().positive(),
  description: text,
  relevantDate: relevantDate.nullable(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  quantity: decimalStringSchema.nullable(),
  unitCode: z.string().nullable(),
  unitPrice: decimalStringSchema.nullable(),
  amount: decimalStringSchema.nullable(),
  retentionKind: projectCostRetentionKindSchema.nullable(),
  retentionRateBps: z.number().int().min(0).max(10000).nullable(),
  retentionAmount: decimalStringSchema.nullable(),
  sourceFigureIds: uniqueSourceFigureIds,
  publicationState: z.literal('draft'),
  version,
  publishReadiness: projectCostPublishReadinessSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()

export const projectCostDetailOperationalDraftSchema = projectCostDetailDraftSchema.pick({
  id: true, projectCostItemId: true, projectId: true, categoryId: true, lineNo: true,
  description: true, relevantDate: true, reference: true, note: true,
  publicationState: true, version: true, createdAt: true, updatedAt: true,
})

export type ProjectCostWorkStatus = z.infer<typeof projectCostWorkStatusSchema>
export type ProjectCostPublicationState = z.infer<typeof projectCostPublicationStateSchema>
export type ProjectCostPublishBlockingCode = z.infer<typeof projectCostPublishBlockingCodeSchema>
export type ProjectCostPublishReadiness = z.infer<typeof projectCostPublishReadinessSchema>
export type CostCommandAck = z.infer<typeof costCommandAckSchema>
export type PrepareProjectCostFinancialDetailInput = z.infer<typeof prepareProjectCostFinancialDetailInputSchema>
export type CorrectPublishedProjectCostInput = z.infer<typeof correctPublishedProjectCostInputSchema>
export type ProjectCostDraftManagementMetadata = z.infer<typeof projectCostDraftManagementMetadataSchema>
export type ProjectCostDraftCategoryOption = { categoryId: string; code: string; name: string; isActive: boolean; draftEligible?: boolean; postingStrategy?: 'ordinary_detail' | 'subcontract_payment' }
export type CreateProjectCostDetailDraftInput = z.infer<typeof createProjectCostDetailDraftInputSchema>
export type UpdateProjectCostDetailDraftInput = z.infer<typeof updateProjectCostDetailDraftInputSchema>
export type PrepareProjectCostDetailFinancialsInput = z.infer<typeof prepareProjectCostDetailFinancialsInputSchema>
export type PublishProjectCostDetailInput = z.infer<typeof publishProjectCostDetailInputSchema>
export type CreateAndPublishProjectCostDetailInput = z.infer<typeof createAndPublishProjectCostDetailInputSchema>
export type CorrectPublishedProjectCostDetailInput = z.infer<typeof correctPublishedProjectCostDetailInputSchema>
export type ProjectCostDetailCommandAck = z.infer<typeof projectCostDetailCommandAckSchema>
export type ProjectCostDetailDraft = z.infer<typeof projectCostDetailDraftSchema>
export type ProjectCostDetailOperationalDraft = z.infer<typeof projectCostDetailOperationalDraftSchema>
export type ProjectCostItem = z.infer<typeof projectCostItemSchema>
export type ProjectCostSummary = z.infer<typeof projectCostSummarySchema>
export type ProjectCostSummaryEntry = z.infer<typeof projectCostSummaryEntrySchema>
export type ProjectCostBreakdown = z.infer<typeof projectCostBreakdownSchema>
export type ProjectCostDetailKind = z.infer<typeof projectCostDetailKindSchema>
export type ProjectCostRetentionKind = z.infer<typeof projectCostRetentionKindSchema>
export type ProjectCostItemDetail = z.infer<typeof projectCostItemDetailSchema>
export type ProjectCostDetailsResponse = z.infer<typeof projectCostDetailsResponseSchema>
