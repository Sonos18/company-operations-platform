import { z } from 'zod'

export const workflowUuidSchema = z.string().uuid()
export const workflowMoneySchema = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
export const workflowCurrencySchema = z.string().regex(/^[A-Z]{3}$/)
const text = z.string().trim().min(1).max(2000)
const ids = z.array(workflowUuidSchema).min(1).max(100).refine(values => new Set(values).size === values.length, 'Duplicate evidence identity')
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
export const costRequestInputSchema = z.object({
  partyId: workflowUuidSchema,
  partyKind: z.enum(['organization', 'crew']),
  crewOwnership: z.enum(['vqh_internal', 'external']).optional(),
  categoryId: workflowUuidSchema,
  contractVersionId: workflowUuidSchema.optional(),
  amount: workflowMoneySchema,
  currencyCode: workflowCurrencySchema,
  basis: costBasisInputSchema,
  evidenceFileIds: ids,
}).strict().superRefine((value, context) => {
  if ((value.partyKind === 'crew') !== (value.crewOwnership !== undefined)) context.addIssue({ code: 'custom', path: ['crewOwnership'], message: 'Crew ownership must be explicit only for a crew' })
  if (value.basis.kind === 'direct_labor' && (value.partyKind !== 'crew' || value.crewOwnership !== 'vqh_internal')) context.addIssue({ code: 'custom', path: ['partyId'], message: 'Direct labor requires an internal VQH crew' })
  if (value.basis.kind === 'subcontract' && value.crewOwnership === 'vqh_internal') context.addIssue({ code: 'custom', path: ['partyId'], message: 'Internal crews use direct labor basis' })
})
export const contractBasisInputSchema = z.object({ partyId: workflowUuidSchema, reference: text, referenceAmount: workflowMoneySchema, currencyCode: workflowCurrencySchema, evidenceFileIds: ids }).strict()
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
export type CostRequestView = { id: UUID; version: number; submittedVersionId: UUID | null; status: 'working' | 'submitted' | 'returned' | 'approved'; partyId: UUID; amount: MoneyText; currencyCode: string; evidenceFileIds: UUID[]; assignmentVersion: number | null; basis: CostBasisInput; installment: { id: UUID; authorized: MoneyText; consumed: MoneyText; remaining: MoneyText } | null; payments: WorkflowPaymentView[] }
export type WorkflowCommandResult = { requestId?: UUID; installmentId?: UUID; paymentId?: UUID; adjustmentId?: UUID; version: number; replayed: boolean }
export type WorkflowCashFacts = {
  currencyCode: string; moneyScale: number
  outgoing: { id: UUID; validAmount: MoneyText }[]
  refunds: { id: UUID; paymentId: UUID; confirmedAmount: MoneyText }[]
  installments: { id: UUID; authorized: MoneyText; consumed: MoneyText }[]
  unreconciledCount: number
  coverage: 'complete' | 'partial' | 'not_recorded'
}
export type CashSummary = { grossPaid: MoneyText; confirmedRefunds: MoneyText; netCash: string; approvedUnspent: MoneyText; unreconciledCount: number; coverage: WorkflowCashFacts['coverage'] }
