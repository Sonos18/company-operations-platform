import {createHash} from 'node:crypto'
import {z} from 'zod'
import type {UserSupabaseClient} from '../../../utils/supabase-client'
import {AppApiError} from '../../../utils/api-error'
import {workflowResponse} from '../workflow/cost-workflow.repository'
import type {WorkflowContext} from '../workflow/cost-workflow.service'
import {costExtractionViewSchema,type ExtractionResult} from '../../../../shared/schemas/costs/cost-extraction'
import {workflowUuidSchema} from '../../../../shared/schemas/costs/cost-workflow'
import type {CostExtractionRepository,ExtractionTarget} from './cost-extraction.service'
const targetSchema=z.object({fileId:workflowUuidSchema,companyId:workflowUuidSchema,projectId:workflowUuidSchema,requestId:workflowUuidSchema.nullable(),fileVersion:z.number().int().positive(),requestVersion:z.number().int().nonnegative().nullable(),sha256:z.string().regex(/^[a-f0-9]{64}$/),mimeType:z.string().min(1),sizeBytes:z.number().int().min(1),bucketId:z.literal('c1-accounting-evidence'),objectPath:z.string().min(1)}).strict()
interface Client{rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>;storage:{from(bucket:string):{download(path:string):Promise<{data:Blob|null;error:unknown}>}}}
export class SupabaseCostExtractionRepository implements CostExtractionRepository{
 private readonly client:Client
 constructor(client:UserSupabaseClient){this.client=client as unknown as Client}
 private async metadata(c:WorkflowContext,p:string,requestId:string|null,fileId:string){
  const value=workflowResponse(await this.client.rpc('c1_workflow_extraction_target',{target_company_id:c.companyId,target_project_id:p,target_request_id:requestId,target_id:fileId}),targetSchema)
  if(value.companyId!==c.companyId||value.projectId!==p||value.fileId!==fileId||value.requestId!==requestId||value.objectPath!==[c.tenantId,c.companyId,p,fileId].join('/'))throw new AppApiError(500,'INTERNAL_ERROR','Phạm vi tệp không hợp lệ.')
  return value
 }
 readTarget:CostExtractionRepository['readTarget']=async(c,p,requestId,fileId)=>this.metadata(c,p,requestId,fileId)
 async download(c:WorkflowContext,p:string,target:ExtractionTarget){
  const value=await this.metadata(c,p,target.requestId,target.fileId)
  if(value.sha256!==target.sha256||value.fileVersion!==target.fileVersion||value.requestVersion!==target.requestVersion)throw new AppApiError(409,'VERSION_CONFLICT','Chứng từ hoặc yêu cầu đã thay đổi.')
  if(value.sizeBytes>5*1024*1024)throw new AppApiError(413,'FILE_TOO_LARGE','Tệp vượt giới hạn quét; bản gốc vẫn được giữ.')
  const response=await this.client.storage.from(value.bucketId).download(value.objectPath)
  if(response.error||!(response.data instanceof Blob))throw new AppApiError(403,'PERMISSION_DENIED','Không thể đọc bản gốc.')
  if(response.data.size!==value.sizeBytes||response.data.size>5*1024*1024)throw new AppApiError(409,'EVIDENCE_UPLOAD_MISMATCH','Bản gốc không khớp.')
  const bytes=new Uint8Array(await response.data.arrayBuffer())
  if(createHash('sha256').update(bytes).digest('hex')!==value.sha256)throw new AppApiError(409,'EVIDENCE_UPLOAD_MISMATCH','Bản gốc không khớp.')
  return bytes
 }
 async persist(c:WorkflowContext,p:string,target:ExtractionTarget,result:ExtractionResult,key:string){
  return workflowResponse(await this.client.rpc('c1_workflow_record_extraction',{target_company_id:c.companyId,target_project_id:p,target_id:target.fileId,target_input:{requestId:target.requestId,fileVersion:target.fileVersion,requestVersion:target.requestVersion,sha256:target.sha256,result},target_idempotency_key:key,target_request_id:c.requestId}),costExtractionViewSchema)
 }
}
