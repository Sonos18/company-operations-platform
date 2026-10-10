import Decimal from 'decimal.js'
import { z } from 'zod'
import { workflowCurrencySchema, workflowMoneySchema, workflowUuidSchema } from './cost-workflow'

const text = z.string().trim().min(1).max(2000)
const shortText = z.string().trim().min(1).max(200)
const positiveDecimal = workflowMoneySchema.refine(value => new Decimal(value).greaterThan(0), 'Must be positive')
const warnings = z.array(text).max(100)

export const materialQuotationAnalysisInputSchema = z.object({
  evidenceFileId: workflowUuidSchema,
  approvedRevisionId: workflowUuidSchema,
  expectedProposalVersion: z.number().int().nonnegative(),
}).strict()

export const materialQuotationExtractionLineSchema = z.object({
  proposalLineId: workflowUuidSchema,
  sourceRowKey: z.string().regex(/^[1-9]\d*:[1-9]\d*$/u).max(200).nullable(),
  quotationMaterialName: shortText.nullable(),
  quotationUnit: shortText.nullable(),
  rawQuantity: shortText.nullable(),
  quotationQuantity: positiveDecimal.nullable(),
  rawUnitPrice: shortText.nullable(),
  unitPrice: positiveDecimal.nullable(),
  rawLineTotal: shortText.nullable(),
  lineTotal: positiveDecimal.nullable(),
  lineTotalBasis: z.enum(['same_as_unit_price', 'adjusted', 'unknown']),
  taxBasis: z.enum(['exclusive', 'inclusive', 'unknown']),
  nameMatches: z.boolean(),
  specificationMatches: z.boolean(),
  unitMatches: z.boolean(),
  sourcePage: z.number().int().positive().nullable(),
  warnings,
}).strict()

export const materialQuotationExtractionSchema = z.object({
  supplier: z.object({
    name: shortText.nullable(),
    taxCode: shortText.nullable(),
    contactName: shortText.nullable(),
    phone: shortText.nullable(),
  }).strict(),
  currencyCode: workflowCurrencySchema.nullable(),
  warnings,
  lines: z.array(materialQuotationExtractionLineSchema).min(1).max(1000),
}).strict()

export const materialQuotationAnalysisResultSchema = z.object({
  model: z.literal('gpt-5.4-mini'),
  source: z.object({
    evidenceFileId: workflowUuidSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    actorId: workflowUuidSchema,
    companyId: workflowUuidSchema,
    projectId: workflowUuidSchema,
    proposalId: workflowUuidSchema,
    approvedRevisionId: workflowUuidSchema,
    proposalVersion: z.number().int().nonnegative(),
  }).strict(),
  matched: z.boolean(),
  supplier: materialQuotationExtractionSchema.shape.supplier,
  currencyCode: workflowCurrencySchema.nullable(),
  warnings,
  lines: z.array(materialQuotationExtractionLineSchema.omit({ rawLineTotal: true, lineTotal: true, lineTotalBasis: true }).extend({
    extractedUnitPrice: positiveDecimal.nullable(),
    quantityMatchesProposal: z.boolean(),
    matched: z.boolean(),
    suggestedAllocationQuantity: positiveDecimal.nullable(),
  }).strict()).min(1).max(1000),
}).strict()

export type MaterialQuotationAnalysisInput = z.infer<typeof materialQuotationAnalysisInputSchema>
export type MaterialQuotationAnalysisResult = z.infer<typeof materialQuotationAnalysisResultSchema>
export type MaterialQuotationExtraction = z.infer<typeof materialQuotationExtractionSchema>
