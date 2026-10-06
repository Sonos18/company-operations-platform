import {createHash} from 'node:crypto'
import {AppApiError} from '../../../utils/api-error'
import type {WorkflowContext} from '../workflow/cost-workflow.service'
import {costExtractionCommandSchema,costExtractionResultSchema,type CostExtractionAdapter,type CostExtractionInput,type CostExtractionView,type ExtractionResult} from '../../../../shared/schemas/costs/cost-extraction'
export interface ExtractionTarget{fileId:string;companyId:string;projectId:string;requestId:string|null;fileVersion:number;requestVersion:number|null;sha256:string;mimeType:string;sizeBytes?:number;documentKind?:string|null}
export interface CostExtractionRepository{
 readTarget(c:WorkflowContext,p:string,requestId:string|null,fileId:string):Promise<ExtractionTarget>
 download(c:WorkflowContext,p:string,target:ExtractionTarget):Promise<Uint8Array>
 persist(c:WorkflowContext,p:string,target:ExtractionTarget,result:ExtractionResult,key:string):Promise<CostExtractionView>
}
export interface CostExtractionServiceOptions{
 refresh?:()=>Promise<{context:WorkflowContext;repository:CostExtractionRepository}>
 adapterFactory?:(value:{context:WorkflowContext;target:Readonly<ExtractionTarget>;input:Readonly<CostExtractionInput>;refresh:()=>Promise<{context:WorkflowContext;repository:CostExtractionRepository}>})=>CostExtractionAdapter
}
type PdfSelection={pdfPageScope?:'1'|'1-2';pdfDeclaredPageCount?:number}
function permitted(c:WorkflowContext){
 for(const code of ['cost.prepare','cost.request.submit','cost.request.file.read','cost.request.read'] as const)if(!c.permissions.includes(code))throw new AppApiError(403,'PERMISSION_DENIED','Bạn không có quyền quét chứng từ này.')
}
function invalidResult():never{throw new AppApiError(500,'INTERNAL_ERROR','Kết quả quét không khớp chứng từ hoặc phạm vi trang đã chọn.')}
export class CostExtractionService{
 constructor(private readonly repository:CostExtractionRepository,private readonly adapter:CostExtractionAdapter,private readonly options:CostExtractionServiceOptions={}){}
 async extract(c:WorkflowContext,p:string,requestId:string|null,fileId:string,key:string,selection:PdfSelection={}){
  c=Object.freeze({...c,permissions:Object.freeze([...c.permissions])})
  permitted(c)
  const command=costExtractionCommandSchema.safeParse({requestId,...selection})
  if(!command.success)throw new AppApiError(400,'INPUT_INVALID','Phạm vi trang PDF không hợp lệ.')
  const target=Object.freeze({...await this.repository.readTarget(c,p,requestId,fileId)})
  if(target.fileId!==fileId||target.companyId!==c.companyId||target.projectId!==p||target.requestId!==requestId)throw new AppApiError(500,'INTERNAL_ERROR','Phạm vi chứng từ không hợp lệ.')
  const bytes=Uint8Array.from(await this.repository.download(c,p,target))
  const scope=Object.freeze({companyId:c.companyId,projectId:p})
  const sourcePageCount=Object.freeze(command.data.pdfDeclaredPageCount===undefined?{kind:'unknown' as const}:{kind:'user-declared' as const,count:command.data.pdfDeclaredPageCount})
  const input:CostExtractionInput=Object.freeze({fileId,mimeType:target.mimeType,documentKind:target.documentKind??undefined,bytes,scope,...(command.data.pdfPageScope?{pdfPageScope:command.data.pdfPageScope,pdfSourcePageCount:sourcePageCount}:{})})
  const fresh=async()=>{
   const current=this.options.refresh?await this.options.refresh():{context:c,repository:this.repository}
   permitted(current.context)
   if(current.context.actorId!==c.actorId||current.context.tenantId!==c.tenantId||current.context.companyId!==c.companyId)throw new AppApiError(403,'PERMISSION_DENIED','Phạm vi người dùng đã thay đổi.')
   const observed=await current.repository.readTarget(current.context,p,requestId,fileId)
   for(const field of ['fileId','companyId','projectId','requestId','fileVersion','requestVersion','sha256','mimeType','sizeBytes','documentKind'] as const)if(observed[field]!==target[field])throw new AppApiError(409,'VERSION_CONFLICT','Chứng từ hoặc yêu cầu đã thay đổi.')
   return current
  }
  const adapter=this.options.adapterFactory?.({context:c,target,input,refresh:fresh})??this.adapter
  const parsed=costExtractionResultSchema.safeParse(await adapter.extract(input))
  if(!parsed.success)invalidResult()
  let extracted=parsed.data
  // The real adapter includes coverage for every admitted PDF, including failures.
  // A no-admission rejection is a non-provider diagnostic; never invent coverage,
  // expose hints or normalize a persisted legacy replay through this branch.
  if(target.mimeType==='application/pdf'&&extracted.methodVersion==='azure-f0-v1'&&!extracted.azurePdfCoverage){
   if(extracted.status!=='unavailable'||Object.keys(extracted.fields).length>0||(extracted.providerLocations?.length??0)>0||extracted.sourceLocations.length>0)invalidResult()
   extracted={status:'unavailable',reviewRequired:true,fields:{},warnings:extracted.warnings,sourceLocations:[],methodVersion:'offline-unavailable-v1'}
  }
  const checkCoverage=(result:ExtractionResult)=>{
   if(target.mimeType!=='application/pdf'||result.methodVersion!=='azure-f0-v1')return
   if(!input.pdfPageScope){
    if(result.status!=='unavailable'||Object.keys(result.fields).length>0||result.azurePdfCoverage)invalidResult()
    return
   }
   const coverage=result.azurePdfCoverage,expectedPages=input.pdfPageScope==='1'?[1]:[1,2]
   if(!coverage||coverage.sourceSha256!==target.sha256||coverage.sourceSha256!==createHash('sha256').update(bytes).digest('hex')
    ||coverage.sourceByteLength!==bytes.byteLength||(target.sizeBytes!==undefined&&coverage.sourceByteLength!==target.sizeBytes)
    ||JSON.stringify(coverage.requestedPages)!==JSON.stringify(expectedPages)
    ||JSON.stringify(coverage.sourcePageCount)!==JSON.stringify(sourcePageCount))invalidResult()
  }
  checkCoverage(extracted)
  // Runtime refresh resolves the live JWT and creates a fresh user-scoped client.
  // Service privilege and cached permissions never authorize result persistence.
  const current=await fresh()
  const view=await current.repository.persist(current.context,p,target,extracted,key)
  if(view.fileId!==fileId||view.requestId!==requestId)invalidResult()
  const replay=costExtractionResultSchema.safeParse(view.result)
  if(!replay.success)invalidResult()
  checkCoverage(replay.data)
  await fresh()
  return {...view,result:replay.data}
 }
}
