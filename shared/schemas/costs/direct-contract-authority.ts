import Decimal from 'decimal.js'
import { z } from 'zod'
import { isoTimestampSchema } from '../iso-timestamp'
import {
  workflowCurrencySchema,
  workflowMoneySchema,
  workflowPaymentInputSchema,
  workflowUuidSchema,
} from './cost-workflow'

const version = z.number().int().nonnegative()
const positiveMoney = workflowMoneySchema.refine(value => new Decimal(value).greaterThan(0), 'Must be positive')
const invoiceNameSchema = z.object({
  orderLineId: workflowUuidSchema,
  name: z.string().trim().min(1).max(200),
}).strict()

export const directContractAuthoritySourceSchema = z.literal('signed_contract')

export const directContractAuthorityViewSchema = z.object({
  id: workflowUuidSchema,
  version,
  authoritySource: directContractAuthoritySourceSchema,
  projectId: workflowUuidSchema,
  orderId: workflowUuidSchema,
  contractId: workflowUuidSchema,
  signedValue: positiveMoney,
  currencyCode: workflowCurrencySchema,
  signedContractEvidenceFileId: workflowUuidSchema,
  signedQuotationEvidenceFileId: workflowUuidSchema,
  installmentId: workflowUuidSchema,
  recordedBy: workflowUuidSchema,
  recordedAt: isoTimestampSchema,
}).strict()

export const canonicalMaterialPaymentInputSchema = workflowPaymentInputSchema.extend({
  invoiceEvidenceFileId: workflowUuidSchema,
  invoiceNames: z.array(invoiceNameSchema).min(1).max(1000).refine(
    values => new Set(values.map(value => value.orderLineId)).size === values.length,
    'Duplicate order line invoice name',
  ),
}).strict()

export type DirectContractAuthoritySource = z.infer<typeof directContractAuthoritySourceSchema>
export type DirectContractAuthorityView = z.infer<typeof directContractAuthorityViewSchema>
export type CanonicalMaterialPaymentInput = z.infer<typeof canonicalMaterialPaymentInputSchema>
