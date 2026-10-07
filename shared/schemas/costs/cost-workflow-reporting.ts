import {z} from 'zod'
import {financeProjectContextSchema,moneyObservationSchema} from './project-finance'
import {workflowUuidSchema,workflowMoneySchema,workflowCurrencySchema} from './cost-workflow'
const aggregate=z.string().regex(/^\d{1,30}\.\d{4}$/)
const count=z.number().int().nonnegative()
const coverage=z.enum(['complete','partial','not_recorded'])
export const workflowCashSummarySchema=z.object({grossPaid:aggregate,confirmedRefunds:aggregate,netCash:aggregate,approvedUnspent:aggregate,unreconciledCount:count,coverage}).strict()
export const workflowCashCategorySchema=z.object({categoryId:workflowUuidSchema.nullable(),code:z.string().min(1),name:z.string().min(1),displayOrder:z.number().int(),workflowCash:workflowCashSummarySchema,retention:moneyObservationSchema}).strict()
export const workflowFinanceSchema=z.object({schemaVersion:z.literal(2),project:financeProjectContextSchema,workflowCash:workflowCashSummarySchema,categories:z.array(workflowCashCategorySchema)}).strict()
const fact=z.object({id:workflowUuidSchema,validAmount:workflowMoneySchema}).strict()
const refund=z.object({id:workflowUuidSchema,paymentId:workflowUuidSchema,confirmedAmount:workflowMoneySchema}).strict()
const installment=z.object({id:workflowUuidSchema,authorized:workflowMoneySchema,consumed:workflowMoneySchema}).strict()
export const workflowCashSnapshotSchema=z.object({project:financeProjectContextSchema,categories:z.array(z.object({categoryId:workflowUuidSchema.nullable(),code:z.string().min(1),name:z.string().min(1),displayOrder:z.number().int(),outgoing:z.array(fact),refunds:z.array(refund),installments:z.array(installment),unreconciledCount:count,verifiedLegacyCount:count,retention:moneyObservationSchema}).strict())}).strict()
export type WorkflowCashSnapshot=z.infer<typeof workflowCashSnapshotSchema>
export type WorkflowFinance=z.infer<typeof workflowFinanceSchema>
const date=z.string().date()
export const reconcileLegacyCashInputSchema=z.object({legacyKind:z.enum(['ordinary_detail','subcontract_payment']),legacyId:workflowUuidSchema,actualOutgoing:workflowMoneySchema,actualPaymentDate:date.nullable(),evidenceFileIds:z.array(workflowUuidSchema).min(1).max(100).refine(v=>new Set(v).size===v.length),reason:z.string().trim().min(1).max(2000),expectedLegacyHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().superRefine((v,c)=>{
 if(/[1-9]/.test(v.actualOutgoing)&&v.actualPaymentDate===null)c.addIssue({code:'custom',path:['actualPaymentDate'],message:'Positive historical cash requires its actual date'})
 if(!/[1-9]/.test(v.actualOutgoing)&&v.actualPaymentDate!==null)c.addIssue({code:'custom',path:['actualPaymentDate'],message:'Zero review has no fabricated payment date'})
})
export type ReconcileLegacyCashInput=z.infer<typeof reconcileLegacyCashInputSchema>
export const workflowInventoryRecordSchema=z.object({legacyKind:z.enum(['ordinary_detail','subcontract_payment']),legacyId:workflowUuidSchema,categoryId:workflowUuidSchema.nullable(),partyId:workflowUuidSchema.nullable(),currencyCode:workflowCurrencySchema,recordedAmount:workflowMoneySchema,recordedDate:date.nullable(),legacyHash:z.string().regex(/^[a-f0-9]{64}$/),status:z.enum(['unreconciled','verified_zero','verified_cash','workflow_cash','voided','excluded_legacy_subcontract','unpublished']),paymentId:workflowUuidSchema.nullable(),mappingId:workflowUuidSchema.nullable()}).strict()
export const workflowInventorySchema=z.object({schemaVersion:z.literal(1),companyId:workflowUuidSchema,projectId:workflowUuidSchema,scopeHash:z.string().regex(/^[a-f0-9]{64}$/),records:z.array(workflowInventoryRecordSchema),counts:z.record(z.string(),count),checksums:z.record(z.string(),z.string().regex(/^[a-f0-9]{64}$/)),sums:z.record(z.string(),aggregate),duplicates:z.array(z.object({kind:z.string(),identities:z.array(workflowUuidSchema)}).strict()),missingCapMapping:z.array(workflowUuidSchema),categories:z.array(z.object({categoryId:workflowUuidSchema.nullable(),code:z.string().min(1),counts:z.record(z.string(),count),checksums:z.record(z.string(),z.string().regex(/^[a-f0-9]{64}$/)),sums:z.record(z.string(),aggregate)}).strict())}).strict()
export type WorkflowInventory=z.infer<typeof workflowInventorySchema>
