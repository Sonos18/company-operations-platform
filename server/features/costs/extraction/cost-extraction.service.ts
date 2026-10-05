import {AppApiError} from '../../../utils/api-error'
import type {WorkflowContext} from '../workflow/cost-workflow.service'
import {costExtractionResultSchema,type CostExtractionAdapter,type CostExtractionView,type ExtractionResult} from '../../../../shared/schemas/costs/cost-extraction'
export interface ExtractionTarget{fileId:string;companyId:string;projectId:string;requestId:string|null;fileVersion:number;requestVersion:number|null;sha256:string;mimeType:string}
export interface CostExtractionRepository{
 readTarget(c:WorkflowContext,p:string,requestId:string|null,fileId:string):Promise<ExtractionTarget>
 download(c:WorkflowContext,p:string,target:ExtractionTarget):Promise<Uint8Array>
 persist(c:WorkflowContext,p:string,target:ExtractionTarget,result:ExtractionResult,key:string):Promise<CostExtractionView>
}
export class CostExtractionService{
 constructor(private readonly repository:CostExtractionRepository,private readonly adapter:CostExtractionAdapter){}
 async extract(c:WorkflowContext,p:string,requestId:string|null,fileId:string,key:string){
  for(const code of ['cost.prepare','cost.request.submit','cost.request.file.read','cost.request.read'] as const)if(!c.permissions.includes(code))throw new AppApiError(403,'PERMISSION_DENIED','Bạn không có quyền quét chứng từ này.')
  const target=Object.freeze({...await this.repository.readTarget(c,p,requestId,fileId)})
  if(target.fileId!==fileId||target.companyId!==c.companyId||target.projectId!==p||target.requestId!==requestId)throw new AppApiError(500,'INTERNAL_ERROR','Phạm vi chứng từ không hợp lệ.')
  const bytes=await this.repository.download(c,p,target)
  const result=costExtractionResultSchema.parse(await this.adapter.extract({fileId,mimeType:target.mimeType,bytes,scope:{companyId:c.companyId,projectId:p}}))
  // The repository command rechecks current role, request revision and immutable original.
  return this.repository.persist(c,p,target,result,key)
 }
}
