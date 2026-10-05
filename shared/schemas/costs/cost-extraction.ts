import {z} from 'zod'
import {workflowUuidSchema,workflowMoneySchema,workflowCurrencySchema,workflowAccountingBasisSchema,type WorkflowScope} from './cost-workflow'
const text=z.string().trim().min(1).max(2000)
const line=z.object({description:text,quantity:workflowMoneySchema,unit:text,unitPrice:workflowMoneySchema}).strict()
const worker=z.object({workerReference:text,days:workflowMoneySchema,dailyRate:workflowMoneySchema,allowance:workflowMoneySchema}).strict()
const basis=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('materials'),deliverySite:text.optional(),lines:z.array(line).max(1000)}).strict(),
 z.object({kind:z.literal('subcontract'),contractReference:text.optional(),acceptanceReference:text.optional(),retentionAmount:workflowMoneySchema.optional()}).strict(),
 z.object({kind:z.literal('direct_labor'),weekStart:z.string().date().optional(),workers:z.array(worker).max(1000)}).strict(),
 z.object({kind:z.enum(['machinery','other']),lines:z.array(line).max(1000)}).strict(),
])
export const costExtractionResultSchema=z.object({
 status:z.enum(['ready','needs_review','unavailable','failed']),reviewRequired:z.literal(true),
 fields:z.object({partyHint:text.optional(),amount:workflowMoneySchema.optional(),currencyCode:workflowCurrencySchema.optional(),basis:basis.optional(),accountingBasis:workflowAccountingBasisSchema.optional()}).strict(),
 warnings:z.array(z.enum(['EXCEL_FILE_INVALID','EXCEL_ACTIVE_CONTENT_UNSUPPORTED','EXCEL_EXTERNAL_LINK_UNSUPPORTED','EXCEL_COORDINATE_LIMIT','EXCEL_LAYOUT_UNRECOGNIZED','EXCEL_MULTIPLE_SHEETS_REQUIRE_REVIEW','FORMULA_NOT_EVALUATED','PARTY_MATCH_REQUIRES_REVIEW','TOTAL_REQUIRES_REVIEW','INVALID_DATE_REQUIRES_REVIEW','NUMBER_FORMAT_REQUIRES_REVIEW','OCR_PROVIDER_NOT_CONFIGURED','LEGACY_XLS_PARSER_UNAVAILABLE','EXTRACTION_FILE_TOO_LARGE','EXTRACTION_RESULT_INVALID'])).max(100),
 sourceLocations:z.array(z.object({field:z.string().min(1).max(160),sheet:z.string().min(1).max(100),row:z.number().int().min(1).max(5000),column:z.number().int().min(1).max(100)}).strict()).max(10000),
 methodVersion:z.enum(['excel-offline-v1','offline-unavailable-v1','synthetic-fixture-v1']),
}).strict()
export type ExtractionResult=z.infer<typeof costExtractionResultSchema>
export interface CostExtractionInput{fileId:string;mimeType:string;bytes:Uint8Array;scope:WorkflowScope}
export interface CostExtractionAdapter{extract(input:CostExtractionInput):Promise<ExtractionResult>}
export const costExtractionCommandSchema=z.object({requestId:workflowUuidSchema.nullable()}).strict()
export const costExtractionViewSchema=z.object({extractionId:workflowUuidSchema,fileId:workflowUuidSchema,requestId:workflowUuidSchema.nullable(),result:costExtractionResultSchema,replayed:z.boolean()}).strict()
export type CostExtractionView=z.infer<typeof costExtractionViewSchema>
