import {createHash} from 'node:crypto'
import {z} from 'zod'
import {costExtractionResultSchema,azureF0PdfPageScopeSchema as pageScope,azureF0PdfAdmissionSchema,azureF0PdfCoverageSchema,type CostExtractionInput,type AzureF0PdfSourcePageCount} from '../../../../shared/schemas/costs/cost-extraction'
import type {AzureF0DocumentMetadata} from './azure-f0-document-inspection'
export const azureF0PdfScopeContract='azure-pdf-scope-v1' as const
export type AzureF0PdfPageScope='1'|'1-2'
export type AzureF0PdfInput=CostExtractionInput&{pdfPageScope?:AzureF0PdfPageScope}
const hash=z.string().regex(/^[0-9a-f]{64}$/)
export type {AzureF0PdfSourcePageCount}
export interface AzureF0PdfAdmissionContext{
 metadata:Readonly<AzureF0DocumentMetadata>
 /** Fresh server request choice, pinned to the author's original/request revision. */
 pdfPageScope:AzureF0PdfPageScope
 sourcePageCount:AzureF0PdfSourcePageCount
}
const metadataKeys=['tenantId','companyId','projectId','fileId','fileVersion','sha256','mimeType','sizeBytes'] as const
const identity=z.string().min(1).max(200).refine(value=>value.trim()===value)
const metadataSchema=z.object({tenantId:identity,companyId:identity,projectId:identity,fileId:identity,fileVersion:z.number().int().positive().safe(),sha256:hash,mimeType:z.literal('application/pdf'),sizeBytes:z.number().int().positive().max(4_000_000).safe()}).strict()
export {azureF0PdfAdmissionSchema,azureF0PdfCoverageSchema}
type ParsedAdmission=z.infer<typeof azureF0PdfAdmissionSchema>
export type AzureF0PdfAdmission=Readonly<Omit<ParsedAdmission,'requestedPages'|'sourcePageCount'>&{requestedPages:readonly [1]|readonly [1,2];sourcePageCount:Readonly<AzureF0PdfSourcePageCount>}>
function pagesMatch(expected:readonly number[],actual:readonly number[]){
 return actual.length===expected.length&&[...actual].sort((a,b)=>a-b).every((value,index)=>value===expected[index])
}
export type AzureF0PdfCoverage=z.infer<typeof azureF0PdfCoverageSchema>
export const azureF0PdfExtractionResultSchema=costExtractionResultSchema.safeExtend({azurePdfCoverage:azureF0PdfCoverageSchema}).strict().refine(value=>
 value.methodVersion==='azure-f0-v1'&&(value.status==='needs_review'?value.azurePdfCoverage.requestedPagesMatched:value.status==='unavailable'&&Object.keys(value.fields).length===0))
export type AzureF0PdfExtractionResult=z.infer<typeof azureF0PdfExtractionResultSchema>
/** Admission of immutable authorized bytes and a deliberate prefix; NOT a decoder or a
 * full-document inspection. Reader rechecks the server's scope choice and original
 * metadata under the current actor/file/request revision, never a browser report.
 */
export function createAzureF0PdfAdmission(expected:Readonly<AzureF0DocumentMetadata>,readContext:(expected:Readonly<AzureF0DocumentMetadata>)=>Promise<AzureF0PdfAdmissionContext|null>){
 const pinned=Object.freeze(Object.fromEntries(metadataKeys.map(key=>[key,expected[key]]))) as Readonly<AzureF0DocumentMetadata>
 return async(input:AzureF0PdfInput):Promise<AzureF0PdfAdmission|null>=>{
  if(input.bytes.byteLength===0||input.bytes.byteLength>4_000_000)return null
  const bytes=Uint8Array.from(input.bytes),mimeType=input.mimeType,selection=pageScope.safeParse(input.pdfPageScope)
  const sourceSha256=createHash('sha256').update(bytes).digest('hex')
  if(!selection.success||!metadataSchema.safeParse(pinned).success||input.fileId!==pinned.fileId
   ||input.scope.companyId!==pinned.companyId||input.scope.projectId!==pinned.projectId||mimeType!==pinned.mimeType
   ||bytes.byteLength!==pinned.sizeBytes||sourceSha256!==pinned.sha256
   ||!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(Buffer.from(bytes.subarray(0,10)).toString('ascii')))return null
  try{
   const fresh=await readContext(pinned)
   if(!fresh||!metadataSchema.safeParse(fresh.metadata).success||metadataKeys.some(key=>fresh.metadata[key]!==pinned[key])
    ||fresh.pdfPageScope!==selection.data)return null
   const count=selection.data==='1'?1:2
   const checked=azureF0PdfAdmissionSchema.safeParse({kind:azureF0PdfScopeContract,admitted:true,sourceSha256,sourceByteLength:bytes.byteLength,mimeType:'application/pdf',
    scope:selection.data,requestedPages:count===1?[1]:[1,2],reservedPageUnits:count,sourcePageCount:fresh.sourcePageCount,wholeDocumentComplete:false})
   if(!checked.success)return null
   return Object.freeze({...checked.data,requestedPages:Object.freeze(checked.data.requestedPages),sourcePageCount:Object.freeze(checked.data.sourcePageCount)}) as AzureF0PdfAdmission
  }catch{return null}
 }
}
/** Page-number reconciliation is scoped evidence, never a claim about original total or OCR accuracy. */
export function azureF0PdfCoverage(admission:AzureF0PdfAdmission,raw?:unknown):AzureF0PdfCoverage{
 const parsed=z.object({analyzeResult:z.object({pages:z.array(z.object({pageNumber:z.number().int().min(1).max(2)}).passthrough()).max(2)}).passthrough()}).passthrough().safeParse(raw)
 const returnedPages=parsed.success?parsed.data.analyzeResult.pages.map(page=>page.pageNumber):[]
 return azureF0PdfCoverageSchema.parse({kind:azureF0PdfScopeContract,sourceSha256:admission.sourceSha256,sourceByteLength:admission.sourceByteLength,requestedPages:admission.requestedPages,returnedPages,
  requestedPagesMatched:pagesMatch(admission.requestedPages,returnedPages),sourcePageCount:admission.sourcePageCount,wholeDocumentComplete:false,reviewRequired:true})
}
export function matchesAzureF0PdfAdmission(coverage:AzureF0PdfCoverage,admission:AzureF0PdfAdmission){
 return coverage.sourceSha256===admission.sourceSha256&&coverage.sourceByteLength===admission.sourceByteLength
  &&JSON.stringify(coverage.requestedPages)===JSON.stringify(admission.requestedPages)&&JSON.stringify(coverage.sourcePageCount)===JSON.stringify(admission.sourcePageCount)
}
