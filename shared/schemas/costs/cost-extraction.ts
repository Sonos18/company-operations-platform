import {z} from 'zod'
import Decimal from 'decimal.js'
import {workflowUuidSchema,workflowMoneySchema,workflowCurrencySchema,workflowAccountingBasisSchema,type WorkflowScope} from './cost-workflow'
const text=z.string().trim().min(1).max(2000)
const line=z.object({description:text,quantity:workflowMoneySchema,unit:text,unitPrice:workflowMoneySchema}).strict()
const SourceMoney=Decimal.clone({precision:60,rounding:Decimal.ROUND_HALF_UP})
const sourceLine=line.extend({
 printedLineAmount:workflowMoneySchema,calculatedLineAmount:workflowMoneySchema,
 status:z.enum(['reconciled','printed_amount_mismatch']),
 pageNumber:z.number().int().min(1).max(2),tableIndex:z.number().int().min(0).max(99),rowIndex:z.number().int().min(0).max(1000),
}).strict().superRefine((value,ctx)=>{
 if(![value.quantity,value.unitPrice,value.calculatedLineAmount,value.printedLineAmount].every(amount=>workflowMoneySchema.safeParse(amount).success))return
 const computed=new SourceMoney(value.quantity).mul(value.unitPrice).toDecimalPlaces(0)
 if(new SourceMoney(value.quantity).lte(0)||!computed.eq(value.calculatedLineAmount)||((value.status==='reconciled')!==computed.eq(value.printedLineAmount)))ctx.addIssue({code:'custom',message:'Source line arithmetic must preserve printed and calculated values'})
})
const worker=z.object({workerReference:text,days:workflowMoneySchema,dailyRate:workflowMoneySchema,allowance:workflowMoneySchema}).strict()
const basis=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('materials'),deliverySite:text.optional(),lines:z.array(line).max(1000),sourceLines:z.array(sourceLine).min(1).max(1000).optional()}).strict(),
 z.object({kind:z.literal('subcontract'),contractReference:text.optional(),acceptanceReference:text.optional(),retentionAmount:workflowMoneySchema.optional()}).strict(),
 z.object({kind:z.literal('direct_labor'),weekStart:z.string().date().optional(),workers:z.array(worker).max(1000)}).strict(),
 z.object({kind:z.enum(['machinery','other']),lines:z.array(line).max(1000)}).strict(),
])
const sha256=z.string().regex(/^[a-f0-9]{64}$/)
const positiveSafe=z.number().int().positive().safe()
export const azureF0PdfPageScopeSchema=z.enum(['1','1-2'])
export const azureF0PdfSourcePageCountSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('unknown')}).strict(),
 z.object({kind:z.literal('user-declared'),count:positiveSafe}).strict(),
 z.object({kind:z.literal('trusted-metadata'),count:positiveSafe}).strict(),
])
const requestedPages=z.union([z.tuple([z.literal(1)]),z.tuple([z.literal(1),z.literal(2)])])
export const azureF0PdfAdmissionSchema=z.object({
 kind:z.literal('azure-pdf-scope-v1'),admitted:z.literal(true),
 sourceSha256:sha256,sourceByteLength:positiveSafe.max(4_000_000),mimeType:z.literal('application/pdf'),
 scope:azureF0PdfPageScopeSchema,requestedPages,reservedPageUnits:z.union([z.literal(1),z.literal(2)]),
 sourcePageCount:azureF0PdfSourcePageCountSchema,wholeDocumentComplete:z.literal(false),
}).strict().refine(v=>v.reservedPageUnits===v.requestedPages.length&&(v.scope==='1'?v.requestedPages.length===1:v.requestedPages.length===2)&&(v.sourcePageCount.kind==='unknown'||v.sourcePageCount.count>=v.requestedPages.length))
export const azureF0PdfCoverageSchema=z.object({
 kind:z.literal('azure-pdf-scope-v1'),sourceSha256:sha256,sourceByteLength:positiveSafe.max(4_000_000),
 requestedPages,returnedPages:z.array(z.number().int().min(1).max(2)).max(2),requestedPagesMatched:z.boolean(),
 sourcePageCount:azureF0PdfSourcePageCountSchema,wholeDocumentComplete:z.literal(false),reviewRequired:z.literal(true),
}).strict().refine(v=>{
 const pages=[...v.returnedPages].sort((a,b)=>a-b)
 const matched=pages.length===v.requestedPages.length&&pages.every((p,i)=>p===v.requestedPages[i])
 return v.requestedPagesMatched===matched&&(v.sourcePageCount.kind==='unknown'||v.sourcePageCount.count>=v.requestedPages.length)
})
export type AzureF0PdfPageScope=z.infer<typeof azureF0PdfPageScopeSchema>
export type AzureF0PdfSourcePageCount=z.infer<typeof azureF0PdfSourcePageCountSchema>
export type AzureF0PdfAdmission=z.infer<typeof azureF0PdfAdmissionSchema>
export type AzureF0PdfCoverage=z.infer<typeof azureF0PdfCoverageSchema>
export const costExtractionResultSchema=z.object({
 status:z.enum(['ready','needs_review','unavailable','failed']),reviewRequired:z.literal(true),
 fields:z.object({partyHint:text.optional(),amount:workflowMoneySchema.optional(),currencyCode:workflowCurrencySchema.optional(),basis:basis.optional(),accountingBasis:workflowAccountingBasisSchema.optional()}).strict(),
 warnings:z.array(z.enum(['EXCEL_FILE_INVALID','EXCEL_ACTIVE_CONTENT_UNSUPPORTED','EXCEL_EXTERNAL_LINK_UNSUPPORTED','EXCEL_COORDINATE_LIMIT','EXCEL_LAYOUT_UNRECOGNIZED','EXCEL_MULTIPLE_SHEETS_REQUIRE_REVIEW','FORMULA_NOT_EVALUATED','PARTY_MATCH_REQUIRES_REVIEW','TOTAL_REQUIRES_REVIEW','INVALID_DATE_REQUIRES_REVIEW','NUMBER_FORMAT_REQUIRES_REVIEW','OCR_PROVIDER_NOT_CONFIGURED','LEGACY_XLS_PARSER_UNAVAILABLE','EXTRACTION_FILE_TOO_LARGE','EXTRACTION_RESULT_INVALID','OCR_PENDING','OCR_DOCUMENT_KIND_REQUIRED','OCR_SCOPE_CHANGED','OCR_COVERAGE_UNVERIFIED','OCR_FREE_PAGE_LIMIT','OCR_FORMAT_UNSUPPORTED','OCR_FREE_QUOTA_EXHAUSTED','OCR_RATE_LIMITED','OCR_RESPONSE_UNCERTAIN','OCR_PDF_PARTIAL_DOCUMENT'])).max(100),
 sourceLocations:z.array(z.object({field:z.string().min(1).max(160),sheet:z.string().min(1).max(100),row:z.number().int().min(1).max(5000),column:z.number().int().min(1).max(100)}).strict()).max(10000),
 providerLocations:z.array(z.object({field:z.string().min(1).max(160),pageNumber:z.number().int().min(1).max(2),polygon:z.array(z.number().finite().nonnegative()).min(8).max(32).refine(v=>v.length%2===0),confidence:z.number().finite().min(0).max(1).optional()}).strict()).max(10000).optional(),
 azurePdfCoverage:azureF0PdfCoverageSchema.optional(),
 methodVersion:z.enum(['azure-f0-v1','excel-offline-v1','offline-unavailable-v1','synthetic-fixture-v1']),
}).strict().superRefine((v,ctx)=>{
 const materials=v.fields.basis?.kind==='materials'?v.fields.basis:undefined
 if(materials?.sourceLines){
  if(v.methodVersion!=='azure-f0-v1'||v.status!=='needs_review'||v.fields.currencyCode!=='VND'||!v.fields.amount||!v.warnings.includes('TOTAL_REQUIRES_REVIEW'))ctx.addIssue({code:'custom',message:'Material source lines require a review-only Azure VND total'})
  const expected=materials.sourceLines.filter(source=>source.status==='reconciled').map(({description,quantity,unit,unitPrice})=>({description,quantity,unit,unitPrice}))
  if(JSON.stringify(expected)!==JSON.stringify(materials.lines))ctx.addIssue({code:'custom',message:'Applicable material lines must equal the ordered reconciled source subset'})
  if(materials.sourceLines.some(source=>source.status==='printed_amount_mismatch')&&!v.warnings.includes('NUMBER_FORMAT_REQUIRES_REVIEW'))ctx.addIssue({code:'custom',message:'Withheld source lines require explicit arithmetic review'})
  const identities=new Set<string>()
  materials.sourceLines.forEach((source,index)=>{
   const identity=`${source.pageNumber}:${source.tableIndex}:${source.rowIndex}`
   if(identities.has(identity))ctx.addIssue({code:'custom',message:'Source row identities must be unique'})
   identities.add(identity)
   for(const field of ['description','quantity','unit','unitPrice','printedLineAmount']){
    const locations=(v.providerLocations??[]).filter(location=>location.field===`basis.sourceLines.${index}.${field}`)
    const financial=['quantity','unitPrice','printedLineAmount'].includes(field)
    if(!locations.length||locations.some(location=>location.pageNumber!==source.pageNumber||(financial&&(location.confidence===undefined||location.confidence<0.8))))ctx.addIssue({code:'custom',message:'Source lines require original page-bound provenance and trusted financial evidence'})
   }
  })
 }
 if(!v.azurePdfCoverage)return
 if(materials?.sourceLines){
  const requested=new Set<number>(v.azurePdfCoverage.requestedPages),returned=new Set<number>(v.azurePdfCoverage.returnedPages)
  if(materials.sourceLines.some(source=>!requested.has(source.pageNumber)||!returned.has(source.pageNumber)))ctx.addIssue({code:'custom',message:'Source lines must remain within matched requested PDF pages'})
 }
 if(v.methodVersion!=='azure-f0-v1'||!['needs_review','unavailable'].includes(v.status))ctx.addIssue({code:'custom',message:'PDF coverage requires review-only Azure result'})
 if(v.status==='needs_review'&&!v.azurePdfCoverage.requestedPagesMatched)ctx.addIssue({code:'custom',message:'Reviewable PDF hints require matched requested pages'})
 if(v.status==='unavailable'&&Object.keys(v.fields).length>0)ctx.addIssue({code:'custom',message:'Unavailable PDF result cannot expose extracted hints'})
 if(!v.azurePdfCoverage.requestedPagesMatched&&(Object.keys(v.fields).length>0||(v.providerLocations?.length??0)>0))ctx.addIssue({code:'custom',message:'Unmatched PDF coverage cannot expose extracted hints'})
})
export type ExtractionResult=z.infer<typeof costExtractionResultSchema>
export interface CostExtractionInput{fileId:string;mimeType:string;bytes:Uint8Array;scope:WorkflowScope;documentKind?:string;pdfPageScope?:AzureF0PdfPageScope;pdfSourcePageCount?:AzureF0PdfSourcePageCount}
export interface CostExtractionAdapter{extract(input:CostExtractionInput):Promise<ExtractionResult>}
export const costExtractionCommandSchema=z.object({requestId:workflowUuidSchema.nullable(),pdfPageScope:azureF0PdfPageScopeSchema.optional(),pdfDeclaredPageCount:positiveSafe.optional()}).strict().refine(v=>v.pdfDeclaredPageCount===undefined||(v.pdfPageScope!==undefined&&v.pdfDeclaredPageCount>=(v.pdfPageScope==='1'?1:2)))
export const costExtractionViewSchema=z.object({extractionId:workflowUuidSchema,fileId:workflowUuidSchema,requestId:workflowUuidSchema.nullable(),result:costExtractionResultSchema,replayed:z.boolean()}).strict()
export type CostExtractionView=z.infer<typeof costExtractionViewSchema>
