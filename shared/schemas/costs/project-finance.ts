import { z } from 'zod'

const uuid = z.string().uuid()
const text = z.string().trim().min(1)
const currencyCode = z.string().trim().length(3)
const date = z.string().date()
const timestamp = z.string().datetime({ offset: true })
const rowMoney = z.string().regex(/^\d{1,16}(?:\.\d{1,4})?$/)
const aggregateMoney = z.string().regex(/^\d{1,30}\.\d{4}$/)
const signedAggregateMoney = z.string().regex(/^-?\d{1,30}\.\d{4}$/)
const version = z.number().int().nonnegative()

export const financeObservationStateSchema = z.enum(['recorded', 'not_recorded', 'needs_reconciliation'])
export const moneyObservationSchema = z.object({
  state: financeObservationStateSchema,
  amount: aggregateMoney.nullable(),
  recordedCount: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if ((value.state === 'recorded') !== (value.amount !== null)) context.addIssue({ code: 'custom', message: 'amount is present only for recorded observations' })
})

export const financeProjectContextSchema = z.object({
  projectId: uuid,
  projectCode: text,
  projectName: text,
  currencyCode,
  moneyScale: z.number().int().min(0).max(4),
  timeZone: text,
  operationalState: z.enum(['active', 'completed', 'paused', 'unknown']),
}).strict()

export const financeIssueSchema = z.object({
  code: z.enum([
    'UNMAPPED_COST_ITEM',
    'CATEGORY_CONFIGURATION_INCOMPLETE',
    'MISSING_CATEGORY_RECORD',
    'LEGACY_SUBCONTRACT_RECONCILIATION_REQUIRED',
    'RETENTION_NOT_RECORDED',
    'BUDGET_BASIS_UNCONFIRMED',
  ]),
  categoryId: uuid.nullable(),
}).strict()

export const financeCategoryRowSchema = z.object({
  categoryId: uuid,
  code: text,
  name: text,
  displayOrder: z.number().int(),
  isActive: z.boolean(),
  itemId: uuid.nullable(),
  description: z.string().nullable(),
  businessReference: z.string().nullable(),
  cost: moneyObservationSchema,
  detailCount: z.number().int().nonnegative(),
  latestRecordedDate: date.nullable(),
  latestRecordedDateSource: z.enum(['business_date', 'created_at']).nullable(),
  warrantyRetention: moneyObservationSchema,
  recordedPaymentsTotal: aggregateMoney.nullable(),
  recordedPaymentCount: z.number().int().nonnegative(),
  legacyReconciliationRequired: z.boolean(),
}).strict()

const financeSummarySchema = z.object({
  budget: moneyObservationSchema,
  ownerAdvances: moneyObservationSchema,
  cost: moneyObservationSchema.extend({ knownSubtotal: aggregateMoney }),
  warrantyRetention: moneyObservationSchema,
  reference: z.object({ kind: z.enum(['approved_budget', 'owner_advance', 'none']), amount: aggregateMoney.nullable() }).strict(),
  margin: z.object({ state: z.literal('unavailable'), amount: z.null(), reasons: z.array(z.enum(['NO_APPROVED_BUDGET', 'COST_INCOMPLETE', 'RETENTION_INCOMPLETE', 'BUDGET_BASIS_UNCONFIRMED'])) }).strict(),
  management: z.object({
    receipts: z.object({
      state: financeObservationStateSchema, amount: aggregateMoney.nullable(), recordedCount: z.number().int().nonnegative(),
      origin: z.enum(['canonical_ledger', 'none']), quality: z.enum(['accounting_source_unverified', 'not_recorded']),
      coverage: z.enum(['recorded_rows_only', 'none']), sourceReferences: z.array(z.string()),
    }).strict(),
    reference: z.object({ kind: z.enum(['approved_budget', 'owner_receipts', 'none']), amount: aggregateMoney.nullable(), basis: z.enum(['unconfirmed_cost_budget', 'recorded_owner_receipts', 'none']) }).strict(),
    result: z.object({ state: z.enum(['provisional', 'unavailable']), amount: signedAggregateMoney.nullable(), basis: z.enum(['owner_receipts', 'approved_budget_unconfirmed', 'none']),
      components: z.object({ receipts: aggregateMoney.nullable(), cost: aggregateMoney.nullable(), independentlyHeldRetention: aggregateMoney.nullable() }).strict(),
      reasons: z.array(z.enum(['NO_REFERENCE', 'COST_INCOMPLETE', 'RETENTION_INCOMPLETE', 'BUDGET_BASIS_UNCONFIRMED'])),
    }).strict(),
    headline: z.object({ kind: z.enum(['provisional_result', 'owner_receipts', 'unavailable']), amount: signedAggregateMoney.nullable(), basis: z.enum(['provisional_owner_receipts_result', 'recorded_owner_receipts', 'none']) }).strict(),
  }).strict(),
  issues: z.array(financeIssueSchema),
}).strict()

export const financeOverviewSchema = z.object({
  schemaVersion: z.literal(1),
  project: financeProjectContextSchema,
  summary: financeSummarySchema,
  categories: z.array(financeCategoryRowSchema),
}).strict()

const pageSize = z.coerce.number().refine(value => value === 25 || value === 50 || value === 100, 'pageSize must be 25, 50 or 100')
const page = z.coerce.number().int().positive()
export const projectDirectoryQuerySchema = z.object({ afterId: uuid.optional(), pageSize: pageSize.default(25) }).strict()
export const financeListQuerySchema = z.object({
  page: page.default(1),
  pageSize: pageSize.default(25),
  q: z.string().max(200).optional(),
  dateFrom: date.optional(),
  dateTo: date.optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
}).strict().superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) context.addIssue({ code: 'custom', path: ['dateTo'], message: 'dateTo must not precede dateFrom' })
})
export const itemDetailQuerySchema = financeListQuerySchema.extend({ retention: z.enum(['all', 'warranty', 'other', 'no_recorded_retention']).default('all') }).strict()
export const paymentQuerySchema = financeListQuerySchema.extend({ retention: z.enum(['all', 'warranty', 'no_recorded_retention']).default('all') }).strict()

const pageEnvelopeSchema = z.object({
  page: page,
  pageSize,
  totalPages: z.number().int().nonnegative(),
  filteredCount: z.number().int().nonnegative(),
  fullCount: z.number().int().nonnegative(),
  filteredAmount: aggregateMoney.nullable(),
  fullAmount: aggregateMoney.nullable(),
}).strict()

const projectRowSchema = z.object({ project: financeProjectContextSchema, summary: financeSummarySchema }).strict()
export const financeProjectListSchema = z.object({ schemaVersion: z.literal(1), projects: z.array(projectRowSchema), nextCursor: uuid.nullable() }).strict()

const budgetHeaderSchema = z.object({
  id: uuid, revisionNo: z.number().int().nonnegative(), name: text, detailMode: z.enum(['summary', 'categorized']), amount: aggregateMoney, currencyCode,
  effectiveDate: date.nullable(), approvedAt: timestamp.nullable(), reference: z.string().nullable(), sourceReference: z.string().nullable(), note: z.string().nullable(), version,
}).strict()
const budgetLineSchema = z.object({ id: uuid, categoryId: uuid, lineNo: z.number().int().positive(), description: text, amount: aggregateMoney, reference: z.string().nullable(), sourceReference: z.string().nullable(), note: z.string().nullable(), version }).strict()
export const financeBudgetSchema = z.object({ schemaVersion: z.literal(1), project: financeProjectContextSchema, state: z.enum(['approved', 'not_recorded']), header: budgetHeaderSchema.nullable(), lines: z.array(budgetLineSchema) }).strict()

const receiptRowSchema = z.object({
  id: uuid, description: text, amount: aggregateMoney, payerName: z.string().nullable(), receiptNo: z.string().nullable(), receivedDate: date.nullable(), effectiveDate: date, dateSource: z.enum(['received_date', 'created_at']),
  recordStatus: z.enum(['recorded', 'voided']), reference: z.string().nullable(), sourceReference: z.string().nullable(), note: z.string().nullable(), createdAt: timestamp, version,
}).strict()
export const financeOwnerAdvancesSchema = z.object({
  schemaVersion: z.literal(1), project: financeProjectContextSchema, recordedTotal: aggregateMoney, recordedCount: z.number().int().nonnegative(), ownerAdvance: moneyObservationSchema,
  filtered: z.object({ amount: aggregateMoney.nullable(), count: z.number().int().nonnegative() }).strict(), rows: z.array(receiptRowSchema), pagination: pageEnvelopeSchema,
}).strict()

const partySchema = z.object({ partyId: uuid, code: text, displayName: text, partyKind: z.enum(['organization', 'crew']) }).strict()
const contractSummarySchema = z.object({
  id: uuid, code: text, contractNo: z.string().nullable(), contractName: text, contractDate: date.nullable(), contractValue: aggregateMoney.nullable(), currencyCode,
  defaultRetentionRateBps: z.number().int().min(0).max(10000).nullable(), isActive: z.boolean(), version, paidTotal: aggregateMoney, paidCount: z.number().int().nonnegative(), recordedRetentionTotal: aggregateMoney.nullable(), recordedRetentionRowCount: z.number().int().nonnegative(),
}).strict()
export const financeSubcontractorListSchema = z.object({
  schemaVersion: z.literal(1), project: financeProjectContextSchema, coverage: financeObservationStateSchema,
  parties: z.array(z.object({ party: partySchema, contracts: z.array(contractSummarySchema) }).strict()),
}).strict()

const paymentRowSchema = z.object({
  id: uuid, contractId: uuid, contractCode: text, contractNo: z.string().nullable(), description: text, paidAmount: aggregateMoney, warrantyRetentionAmount: aggregateMoney.nullable(),
  retentionRateBps: z.number().int().min(0).max(10000).nullable(), paymentDate: date.nullable(), effectiveDate: date, dateSource: z.enum(['payment_date', 'created_at']),
  recordStatus: z.enum(['recorded', 'voided']), reference: z.string().nullable(), sourceReference: z.string().nullable(), note: z.string().nullable(), createdAt: timestamp, version,
}).strict()
const paymentsPageSchema = z.object({
  rows: z.array(paymentRowSchema), pagination: pageEnvelopeSchema, recordedTotal: aggregateMoney, recordedCount: z.number().int().nonnegative(), recordedRetentionTotal: aggregateMoney.nullable(), recordedRetentionRowCount: z.number().int().nonnegative(),
}).strict()
export const financeSubcontractorDetailSchema = z.object({ schemaVersion: z.literal(1), project: financeProjectContextSchema, party: partySchema, contracts: z.array(contractSummarySchema), payments: paymentsPageSchema }).strict()

const contractDetailSchema = z.object({
  id: uuid, code: text, contractNo: z.string().nullable(), contractName: text, contractDate: date.nullable(), contractValue: aggregateMoney.nullable(), currencyCode,
  defaultRetentionRateBps: z.number().int().min(0).max(10000).nullable(), isActive: z.boolean(), version, reference: z.string().nullable(), sourceReference: z.string().nullable(), note: z.string().nullable(),
  paidTotal: aggregateMoney, paidCount: z.number().int().nonnegative(), recordedRetentionTotal: aggregateMoney.nullable(), recordedRetentionRowCount: z.number().int().nonnegative(), referenceHeadroom: signedAggregateMoney.nullable(), referenceHeadroomReason: z.enum(['CONTRACT_VALUE_MISSING', 'RETENTION_NOT_RECORDED']).nullable(),
}).strict()
export const financeSubcontractDetailSchema = z.object({ schemaVersion: z.literal(1), project: financeProjectContextSchema, party: partySchema, contract: contractDetailSchema, payments: paymentsPageSchema }).strict()

const ordinaryDetailRowSchema = z.object({
  id: uuid, lineNo: z.number().int().positive(), detailKind: z.enum(['opening_balance', 'line_item']), description: text, quantity: z.string().nullable(), unitCode: z.string().nullable(), unitPrice: z.string().nullable(), amount: aggregateMoney,
  retentionKind: z.enum(['warranty', 'other']).nullable(), retentionRateBps: z.number().int().min(0).max(10000).nullable(), retentionAmount: aggregateMoney.nullable(), relevantDate: date.nullable(), effectiveDate: date, dateSource: z.enum(['relevant_date', 'created_at']), reference: z.string().nullable(), note: z.string().nullable(), createdAt: timestamp, version,
}).strict()
const itemIdentitySchema = z.object({ id: uuid, description: text, businessReference: z.string().nullable(), parentAmount: aggregateMoney, currencyCode, version }).strict()
export const financeItemDetailsSchema = z.discriminatedUnion('kind', [
  z.object({ schemaVersion: z.literal(1), kind: z.literal('ordinary'), project: financeProjectContextSchema, category: financeCategoryRowSchema, item: itemIdentitySchema, details: z.object({ rows: z.array(ordinaryDetailRowSchema), pagination: pageEnvelopeSchema }).strict() }).strict(),
  z.object({ schemaVersion: z.literal(1), kind: z.literal('legacy_subcontract'), project: financeProjectContextSchema, category: financeCategoryRowSchema, item: itemIdentitySchema, reason: z.literal('LEGACY_SUBCONTRACT_RECONCILIATION_REQUIRED') }).strict(),
])

export {
  aggregateMoney as financeAggregateMoneySchema,
  rowMoney as financeRowMoneySchema,
  signedAggregateMoney as financeSignedAggregateMoneySchema,
  timestamp as financeTimestampSchema,
  version as financeVersionSchema,
}

export type FinanceOverview = z.infer<typeof financeOverviewSchema>
export type MoneyObservation = z.infer<typeof moneyObservationSchema>
export type FinanceProjectContext = z.infer<typeof financeProjectContextSchema>
export type FinanceCategoryRow = z.infer<typeof financeCategoryRowSchema>
export type FinanceProjectList = z.infer<typeof financeProjectListSchema>
export type FinanceBudget = z.infer<typeof financeBudgetSchema>
export type FinanceOwnerAdvances = z.infer<typeof financeOwnerAdvancesSchema>
export type FinanceSubcontractorList = z.infer<typeof financeSubcontractorListSchema>
export type FinanceSubcontractorDetail = z.infer<typeof financeSubcontractorDetailSchema>
export type FinanceSubcontractDetail = z.infer<typeof financeSubcontractDetailSchema>
export type FinanceItemDetails = z.infer<typeof financeItemDetailsSchema>
export type ProjectDirectoryQuery = z.infer<typeof projectDirectoryQuerySchema>
export type FinanceListQuery = z.infer<typeof financeListQuerySchema>
export type ItemDetailQuery = z.infer<typeof itemDetailQuerySchema>
export type PaymentQuery = z.infer<typeof paymentQuerySchema>
