import Decimal from 'decimal.js'
import { z } from 'zod'
import { decimalStringSchema } from './master-data'

const uuid=z.string().uuid(); const version=z.number().int().nonnegative(); const text=z.string().trim().min(1); const currency=z.string().regex(/^[A-Z]{3}$/u); const date=z.string().date()
const positiveMoney=decimalStringSchema.refine(value=>new Decimal(value).greaterThan(0),'must be positive')
const uniqueIds=z.array(uuid).refine(ids=>new Set(ids).size===ids.length,'IDs must be unique')
export const recordSubcontractPaymentInputSchema=z.object({expectedSubcontractVersion:version,description:text,paidAmount:positiveMoney,currencyCode:currency,paymentDate:date.optional(),warrantyRetentionAmount:decimalStringSchema.nullable().optional(),retentionRateBps:z.number().int().min(0).max(10000).nullable().optional(),paymentReference:text.optional(),sourceReference:text.optional(),note:z.string().optional(),replacesPaymentId:uuid.optional(),evidenceFileIds:uniqueIds.optional()}).strict().superRefine((value,context)=>{if(value.retentionRateBps!==undefined&&value.retentionRateBps!==null&&(value.warrantyRetentionAmount===undefined||value.warrantyRetentionAmount===null))context.addIssue({code:'custom',path:['warrantyRetentionAmount'],message:'retention amount required'})})
export const voidSubcontractPaymentInputSchema=z.object({expectedVersion:version,reason:text}).strict()
export const recordSubcontractPaymentResultSchema=z.object({paymentId:uuid,version,status:z.literal('recorded'),replayed:z.boolean()}).strict()
export const voidSubcontractPaymentResultSchema=z.object({paymentId:uuid,version,status:z.literal('voided'),replayed:z.boolean()}).strict()
export type RecordSubcontractPaymentInput=z.infer<typeof recordSubcontractPaymentInputSchema>
export type VoidSubcontractPaymentInput=z.infer<typeof voidSubcontractPaymentInputSchema>
