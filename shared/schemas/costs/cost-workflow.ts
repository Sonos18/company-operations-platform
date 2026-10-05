import { z } from 'zod'

export const workflowUuidSchema = z.string().uuid()
export const workflowMoneySchema = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
export const workflowCurrencySchema = z.string().regex(/^[A-Z]{3}$/)
const text = z.string().trim().min(1).max(2000)
const ids = z.array(workflowUuidSchema).min(1).max(100).refine(values => new Set(values).size === values.length, 'Duplicate evidence identity')
const timestamp=z.string().datetime({offset:true})
const version = z.number().int().nonnegative()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T00:00:00.000Z')
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Invalid calendar date')
const line = z.object({ description: text, quantity: workflowMoneySchema, unit: text, unitPrice: workflowMoneySchema }).strict()
const worker = z.object({ workerReference: text, days: workflowMoneySchema, dailyRate: workflowMoneySchema, allowance: workflowMoneySchema }).strict()

export const costBasisInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('materials'), lines: z.array(line).min(1).max(1000), deliverySite: text }).strict(),
  z.object({ kind: z.literal('subcontract'), subcontractId: workflowUuidSchema, acceptanceReference: text, retentionAmount: workflowMoneySchema }).strict(),
  z.object({ kind: z.literal('direct_labor'), weekStart: date, workers: z.array(worker).min(1).max(1000) }).strict(),
  z.object({ kind: z.enum(['machinery', 'other']), lines: z.array(line).min(1).max(1000) }).strict(),
])
export const workflowAccountingBasisSchema=z.object({vatBasis:text.optional(),roundingBasis:text.optional(),allowanceBasis:text.optional()}).strict().refine(value=>Object.keys(value).length>0,'Accounting basis must contain reviewed notes')
export const costRequestInputSchema = z.object({
  partyId: workflowUuidSchema,
  partyKind: z.enum(['organization', 'crew']),
  crewOwnership: z.enum(['vqh_internal', 'external']).optional(),
  categoryId: workflowUuidSchema,
  contractVersionId: workflowUuidSchema.optional(),
  amount: workflowMoneySchema,
  currencyCode: workflowCurrencySchema,
  basis: costBasisInputSchema,
  accountingBasis:workflowAccountingBasisSchema.optional(),
  evidenceFileIds: ids,
}).strict().superRefine((value, context) => {
  if ((value.partyKind === 'crew') !== (value.crewOwnership !== undefined)) context.addIssue({ code: 'custom', path: ['crewOwnership'], message: 'Crew ownership must be explicit only for a crew' })
  if (value.basis.kind === 'direct_labor' && (value.partyKind !== 'crew' || value.crewOwnership !== 'vqh_internal')) context.addIssue({ code: 'custom', path: ['partyId'], message: 'Direct labor requires an internal VQH crew' })
  if (value.basis.kind === 'subcontract' && value.crewOwnership === 'vqh_internal') context.addIssue({ code: 'custom', path: ['partyId'], message: 'Internal crews use direct labor basis' })
})
export const contractBasisInputSchema = z.object({ partyId: workflowUuidSchema, sourceSubcontractId:workflowUuidSchema.optional(), reference: text, referenceAmount: workflowMoneySchema, currencyCode: workflowCurrencySchema, evidenceFileIds: ids }).strict()
export const contractAdjustmentInputSchema = z.object({ expectedVersion: version, proposedCap: workflowMoneySchema, reason: text, evidenceFileIds: ids }).strict()
export const cashAdjustmentInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('refund'), requestedAmount: workflowMoneySchema, reason: text, evidenceFileIds: ids, expectedVersion: version }).strict(),
  z.object({ kind: z.literal('correction'), correctedOutgoing: workflowMoneySchema, reason: text, evidenceFileIds: ids, expectedVersion: version }).strict(),
])
export const workflowCommandVersionSchema = z.object({ expectedVersion: version }).strict()
export const workflowDecisionInputSchema = z.object({ submittedVersionId: workflowUuidSchema, decision: z.enum(['approve', 'return']), reason: text.optional() }).strict().refine(value => value.decision !== 'return' || value.reason !== undefined, 'A return requires a reason')
export const workflowPaymentInputSchema = z.object({ amount: workflowMoneySchema.refine(value => /[1-9]/.test(value), 'Payment must be positive'), currencyCode: workflowCurrencySchema, paymentDate: date, reference: text, evidenceFileIds: ids, expectedVersion: version }).strict()
export const workflowRefundConfirmationSchema = z.object({ amount: workflowMoneySchema.refine(value => /[1-9]/.test(value), 'Refund must be positive'), receivedDate: date, evidenceFileIds: ids, expectedVersion: version }).strict()
export const workflowManagerAssignmentSchema = z.object({ managerUserId: workflowUuidSchema, expectedAssignmentVersion: version, reason: text }).strict()

export type UUID = string
export type MoneyText = string
export type WorkflowScope = { companyId: UUID; projectId: UUID }
export type CostBasisInput = z.infer<typeof costBasisInputSchema>
export type CostRequestInput = z.infer<typeof costRequestInputSchema>
export type ContractBasisInput = z.infer<typeof contractBasisInputSchema>
export type ContractAdjustmentInput = z.infer<typeof contractAdjustmentInputSchema>
export type CashAdjustmentInput = z.infer<typeof cashAdjustmentInputSchema>
export type WorkflowCommandVersion = z.infer<typeof workflowCommandVersionSchema>
export type WorkflowDecisionInput = z.infer<typeof workflowDecisionInputSchema>
export type WorkflowPaymentInput = z.infer<typeof workflowPaymentInputSchema>
export type WorkflowRefundConfirmation = z.infer<typeof workflowRefundConfirmationSchema>
export type WorkflowManagerAssignmentInput = z.infer<typeof workflowManagerAssignmentSchema>
export type WorkflowPartyOption = { id: UUID; name: string; kind: 'organization' | 'crew'; crewOwnership: 'vqh_internal' | 'external' | null }
export type WorkflowPaymentView = { id: UUID; amount: MoneyText; refunded: MoneyText; correctedCash: MoneyText; currencyCode: string; paymentDate: string; evidenceFileIds: UUID[] }
export type CostRequestView = z.infer<typeof costRequestViewSchema>
export type WorkflowCommandResult = { contractId?:UUID;contractVersionId?:UUID;assignmentId?:UUID;notificationId?:UUID;reconciliationId?:UUID; requestId?: UUID; installmentId?: UUID; paymentId?: UUID; adjustmentId?: UUID; version: number; replayed: boolean }
export type WorkflowCashFacts = {
  currencyCode: string; moneyScale: number
  outgoing: { id: UUID; validAmount: MoneyText }[]
  refunds: { id: UUID; paymentId: UUID; confirmedAmount: MoneyText }[]
  installments: { id: UUID; authorized: MoneyText; consumed: MoneyText }[]
  unreconciledCount: number
  coverage: 'complete' | 'partial' | 'not_recorded'
}
export type CashSummary = { grossPaid: MoneyText; confirmedRefunds: MoneyText; netCash: string; approvedUnspent: MoneyText; unreconciledCount: number; coverage: WorkflowCashFacts['coverage'] }

export const workflowUpdateRequestInputSchema=costRequestInputSchema.safeExtend({expectedVersion:version})
export type WorkflowUpdateRequestInput=z.infer<typeof workflowUpdateRequestInputSchema>
export const workflowCommandResultSchema=z.object({requestId:workflowUuidSchema.optional(),installmentId:workflowUuidSchema.optional(),paymentId:workflowUuidSchema.optional(),adjustmentId:workflowUuidSchema.optional(),contractId:workflowUuidSchema.optional(),contractVersionId:workflowUuidSchema.optional(),assignmentId:workflowUuidSchema.optional(),notificationId:workflowUuidSchema.optional(),reconciliationId:workflowUuidSchema.optional(),version,replayed:z.boolean()}).strict()
export const workflowPaymentViewSchema=z.object({id:workflowUuidSchema,amount:workflowMoneySchema,refunded:workflowMoneySchema,correctedCash:workflowMoneySchema,currencyCode:workflowCurrencySchema,paymentDate:date,version,evidenceFileIds:ids}).strict()
export const workflowDecisionViewSchema=z.object({id:workflowUuidSchema,submittedVersionId:workflowUuidSchema,decision:z.enum(['approve','return']),reason:text.nullable(),assignmentId:workflowUuidSchema,decidedBy:workflowUuidSchema,decidedAt:timestamp}).strict()
export const costRequestViewSchema=z.object({id:workflowUuidSchema,version,submittedVersionId:workflowUuidSchema.nullable(),status:z.enum(['working','submitted','returned','approved']),partyKind:z.enum(['organization','crew']),crewOwnership:z.enum(['vqh_internal','external']).nullable(),categoryId:workflowUuidSchema,contractVersionId:workflowUuidSchema.nullable(),latestDecision:workflowDecisionViewSchema.nullable(),partyId:workflowUuidSchema,partyName:text.nullable().optional(),amount:workflowMoneySchema,currencyCode:workflowCurrencySchema,evidenceFileIds:ids,assignmentVersion:version.nullable(),basis:costBasisInputSchema,accountingBasis:workflowAccountingBasisSchema.nullable().optional(),installment:z.object({id:workflowUuidSchema,version,authorized:workflowMoneySchema,consumed:workflowMoneySchema,remaining:workflowMoneySchema}).strict().nullable(),payments:z.array(workflowPaymentViewSchema)}).strict()
export const workflowContractViewSchema=z.object({id:workflowUuidSchema,versionId:workflowUuidSchema,partyId:workflowUuidSchema,reference:text,currencyCode:workflowCurrencySchema,version:z.number().int().positive(),cap:workflowMoneySchema,evidenceFileIds:ids,sourceSubcontractId:workflowUuidSchema.nullable()}).strict()
export type WorkflowContractView=z.infer<typeof workflowContractViewSchema>
export const workflowNotificationViewSchema=z.object({id:workflowUuidSchema,projectId:workflowUuidSchema,requestId:workflowUuidSchema,submittedVersionId:workflowUuidSchema,kind:z.enum(['installment','contract_adjustment','refund','correction']),decisionId:workflowUuidSchema,recipientId:workflowUuidSchema,deliveryState:z.enum(['available','undelivered']),readAt:timestamp.nullable(),createdAt:timestamp}).strict()
export type WorkflowNotificationView=z.infer<typeof workflowNotificationViewSchema>

export const workflowAdjustmentViewSchema=z.object({id:workflowUuidSchema,kind:z.enum(['contract_adjustment','refund','correction']),version,submittedVersionId:workflowUuidSchema.nullable(),status:z.enum(['working','submitted','returned','approved']),partyId:workflowUuidSchema,contractId:workflowUuidSchema.nullable(),sourcePaymentId:workflowUuidSchema.nullable(),input:z.union([contractAdjustmentInputSchema,cashAdjustmentInputSchema]),confirmedRefund:workflowMoneySchema,correctionApplied:z.boolean(),latestDecision:workflowDecisionViewSchema.nullable()}).strict()
export type WorkflowAdjustmentView=z.infer<typeof workflowAdjustmentViewSchema>
export const workflowProjectContextSchema=z.object({mode:z.enum(['legacy','document_backed_v1']),operationalState:z.enum(['active','completed','paused','unknown']),manager:z.object({userId:workflowUuidSchema,assignmentId:workflowUuidSchema,version,reason:text}).strict().nullable(),canSubmit:z.boolean(),canDecide:z.boolean(),canAssign:z.boolean(),eligibleManagers:z.array(z.object({userId:workflowUuidSchema,label:text}).strict())}).strict()
export type WorkflowProjectContext=z.infer<typeof workflowProjectContextSchema>

export const workflowDirectoryQuerySchema=z.object({afterId:workflowUuidSchema.optional(),pageSize:z.coerce.number().int().min(1).max(100).default(25)}).strict()
export const workflowDirectorySchema=z.object({mode:z.enum(['legacy','document_backed_v1']),projects:z.array(z.object({projectId:workflowUuidSchema,code:text,name:text,operationalState:z.enum(['active','completed','paused','unknown'])}).strict()),nextCursor:workflowUuidSchema.nullable()}).strict()
export type WorkflowDirectoryQuery=z.infer<typeof workflowDirectoryQuerySchema>
export type WorkflowDirectory=z.infer<typeof workflowDirectorySchema>
export const workflowRequestHistorySchema=z.array(z.object({id:workflowUuidSchema,version:z.number().int().positive(),input:z.union([costRequestInputSchema,contractAdjustmentInputSchema,cashAdjustmentInputSchema]),evidenceFileIds:ids,assignmentId:workflowUuidSchema,submittedBy:workflowUuidSchema,submittedAt:timestamp,decision:workflowDecisionViewSchema.nullable()}).strict())
export type WorkflowRequestHistory=z.infer<typeof workflowRequestHistorySchema>
