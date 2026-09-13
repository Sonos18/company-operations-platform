import { z } from 'zod'
import { createFileUploadIntentInputSchema } from '../files'

const uuid = z.string().uuid()
const text = z.string().trim().min(1)
const version = z.number().int().nonnegative()
const timestamp = z.string().datetime()
export const sourceStatusSchema = z.enum(['draft', 'shared'])
export const sourceSelectionRoleSchema = z.enum(['unknown', 'detail', 'subtotal', 'report_total', 'duplicate_presentation', 'supporting'])
export const sourceSelectionHandlingSchema = z.enum(['pending', 'ready_for_normalization', 'reference_only', 'excluded'])
export const sourceFigureValueStateSchema = z.enum(['known', 'blank', 'formula_error', 'missing_cached', 'not_numeric'])
export const sourceFigureMetricSchema = z.enum(['cost_total', 'labor_total', 'commitment_total', 'cash_total', 'reported_balance', 'unclassified'])
export const sourceFigureBasisSchema = z.enum(['net', 'gross', 'payable_basis', 'cash', 'mixed', 'unknown'])
export const sourceFigureStatusSchema = z.enum(['draft', 'shared'])
export const sourceFigureBalanceKindSchema = z.enum(['total_outstanding', 'outside_retention', 'unallocated_cash', 'unknown'])
export const sourceFigureRoundingBasisSchema = z.enum(['exact', 'source_rounded', 'unknown'])
export const sourceFigurePeriodBasisSchema = z.enum(['activity_range', 'cumulative_as_of', 'unknown'])
export const sourceFigureScopeKindSchema = z.enum(['subcontractors_only', 'whole_project', 'mixed', 'unknown'])
export const sourceFigureConfirmationSchema = z.enum(['unverified', 'confirmed_external', 'disputed'])
export const sourceReviewIssueKindSchema = z.enum(['scope_uncertain', 'party_uncertain', 'semantics_uncertain', 'date_conflict', 'rounding_difference', 'formula_error', 'possible_duplicate', 'coverage_overlap', 'other'])
export const sourceReviewImpactSchema = z.enum(['blocks_normalization', 'comparison_only'])
export const sourceReviewStatusSchema = z.enum(['open', 'resolved'])
export const sourceReviewResolutionSchema = z.enum(['link_existing', 'independent_events', 'corrected', 'alternative_evidence', 'reference_only', 'excluded', 'not_comparable'])
export const sourceLocatorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cell_range'), sheetName: z.string().min(1).max(255), range: z.string().trim().min(1).max(64) }).strict(),
  z.object({ kind: z.literal('page_range'), fromPage: z.number().int().min(1), toPage: z.number().int().min(1) }).strict().refine(value => value.fromPage <= value.toPage),
  z.object({ kind: z.literal('whole_file'), note: z.string().trim().min(1).max(500).optional() }).strict(),
])
export const createAccountingSourceInputSchema = z.object({ code: text.max(64), title: text.max(255), sourceSystem: text.max(64), suggestedProjectId: uuid.optional() }).strict()
export const updateAccountingSourceInputSchema = createAccountingSourceInputSchema.partial().extend({ expectedVersion: version }).strict()
export const createAccountingSourceVersionInputSchema = createFileUploadIntentInputSchema.extend({ sourceVersionLabel: text.max(255).optional(), sourcePeriodText: text.max(500).optional(), sourceAsOfText: text.max(500).optional() }).strict()
export const idempotencyInputSchema = z.object({ idempotencyKey: uuid }).strict()
export const createSourceSelectionInputSchema = z.object({ locator: sourceLocatorSchema, sourceRole: sourceSelectionRoleSchema, handling: sourceSelectionHandlingSchema, rawDescription: z.string().max(2000).optional(), rawDateText: z.string().max(500).optional(), mappedProjectId: uuid.optional(), mappedEngagementId: uuid.optional(), mappedComponentId: uuid.optional(), handlingReason: z.string().trim().min(1).max(1000).optional() }).strict()
export const updateSourceSelectionInputSchema = createSourceSelectionInputSchema.partial().extend({ expectedVersion: version }).strict()
const decimal = z.string().regex(/^-?\d{1,16}(?:\.\d{1,4})?$/)
const sourceFigureFieldsSchema = z.object({ label: text.max(255), metricKind: sourceFigureMetricSchema, rawValueText: z.string().max(1000), valueState: sourceFigureValueStateSchema, amount: decimal.optional(), currencyCode: z.string().trim().length(3).optional(), basis: sourceFigureBasisSchema, scopeDescription: z.string().trim().min(1).max(1000), selectionId: uuid.optional() }).strict()
function requireKnownAmount<T extends { valueState: z.infer<typeof sourceFigureValueStateSchema>; amount?: string }>(value: T, ctx: z.RefinementCtx) { if (value.valueState === 'known' && value.amount === undefined) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'known requires amount' }); if (value.valueState !== 'known' && value.amount !== undefined) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'non-known cannot carry amount' }) }
export const createSourceFigureInputSchema = sourceFigureFieldsSchema.superRefine(requireKnownAmount)
export const updateSourceFigureInputSchema = sourceFigureFieldsSchema.partial().extend({ expectedVersion: version }).strict()
export const createSourceFigureRevisionInputSchema = sourceFigureFieldsSchema.pick({ label: true, rawValueText: true, valueState: true, amount: true, currencyCode: true, basis: true, scopeDescription: true }).extend({ expectedVersion: version }).strict().superRefine(requireKnownAmount)
export const createSourceReviewIssueInputSchema = z.object({ issueKind: sourceReviewIssueKindSchema, description: text.max(2000), impact: sourceReviewImpactSchema, relatedSelectionId: uuid.optional() }).strict()
export const resolveSourceReviewIssueInputSchema = z.object({ expectedVersion: version, resolution: sourceReviewResolutionSchema, resolutionNote: text.max(2000), resolutionReference: z.string().trim().min(1).max(500).optional(), idempotencyKey: uuid }).strict()
export const sourceReviewIssueSchema = z.object({ id: uuid, sourceSelectionId: uuid, relatedSelectionId: uuid.nullable(), issueKind: sourceReviewIssueKindSchema, description: text, impact: sourceReviewImpactSchema, status: sourceReviewStatusSchema, resolution: sourceReviewResolutionSchema.nullable(), resolutionNote: z.string().nullable(), version, openedAt: timestamp, resolvedAt: timestamp.nullable() }).strict()
export const accountingSourceSchema = z.object({ id: uuid, code: text, title: text, sourceSystem: text, suggestedProjectId: uuid.nullable(), isArchived: z.boolean(), version, createdAt: timestamp, updatedAt: timestamp }).strict()
export const accountingSourceVersionSchema = z.object({ id: uuid, sourceId: uuid, versionNo: z.number().int().positive(), fileId: uuid, status: sourceStatusSchema, sourceVersionLabel: z.string().nullable(), sourcePeriodText: z.string().nullable(), sourceAsOfText: z.string().nullable(), version, createdAt: timestamp, sharedAt: timestamp.nullable() }).strict()
export const sourceSelectionSchema = z.object({ id: uuid, sourceVersionId: uuid, locator: sourceLocatorSchema, locatorKey: text, sourceRole: sourceSelectionRoleSchema, handling: sourceSelectionHandlingSchema, rawDescription: z.string().nullable(), rawDateText: z.string().nullable(), mappedProjectId: uuid.nullable(), mappedEngagementId: uuid.nullable(), mappedComponentId: uuid.nullable(), handlingReason: z.string().nullable(), version, createdAt: timestamp, updatedAt: timestamp }).strict()
export const sourceReportedFigureSchema = z.object({ id: uuid, sourceSelectionId: uuid.nullable(), figureFamilyId: uuid, revisionNo: z.number().int().positive(), replacesFigureId: uuid.nullable(), label: text, metricKind: sourceFigureMetricSchema, rawValueText: z.string(), valueState: sourceFigureValueStateSchema, amount: decimal.nullable(), currencyCode: z.string().length(3).nullable(), basis: sourceFigureBasisSchema, balanceKind: sourceFigureBalanceKindSchema.nullable(), roundingBasis: sourceFigureRoundingBasisSchema, roundingNote: z.string().nullable(), periodBasis: sourceFigurePeriodBasisSchema, periodFrom: z.string().date().nullable(), periodTo: z.string().date().nullable(), asOfDate: z.string().date().nullable(), projectId: uuid.nullable(), engagementId: uuid.nullable(), scopeKind: sourceFigureScopeKindSchema, scopeDescription: text, confirmation: sourceFigureConfirmationSchema, confirmationReference: z.string().nullable(), status: sourceFigureStatusSchema, version, createdAt: timestamp, sharedAt: timestamp.nullable() }).strict()

export type CreateAccountingSourceInput = z.infer<typeof createAccountingSourceInputSchema>
export type UpdateAccountingSourceInput = z.infer<typeof updateAccountingSourceInputSchema>
export type CreateAccountingSourceVersionInput = z.infer<typeof createAccountingSourceVersionInputSchema>
export type CreateSourceSelectionInput = z.infer<typeof createSourceSelectionInputSchema>
export type UpdateSourceSelectionInput = z.infer<typeof updateSourceSelectionInputSchema>
export type CreateSourceFigureInput = z.infer<typeof createSourceFigureInputSchema>
export type UpdateSourceFigureInput = z.infer<typeof updateSourceFigureInputSchema>
export type CreateSourceFigureRevisionInput = z.infer<typeof createSourceFigureRevisionInputSchema>
export type AccountingSource = z.infer<typeof accountingSourceSchema>
export type AccountingSourceVersion = z.infer<typeof accountingSourceVersionSchema>
export type SourceSelection = z.infer<typeof sourceSelectionSchema>
export type SourceReportedFigure = z.infer<typeof sourceReportedFigureSchema>
export type SourceReviewIssue = z.infer<typeof sourceReviewIssueSchema>
