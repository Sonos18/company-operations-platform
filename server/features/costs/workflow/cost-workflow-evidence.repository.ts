import { z } from 'zod'
import { apiErrorCodeSchema } from '../../../../shared/schemas/api-error'
import { costEvidenceUploadIntentSchema,costEvidenceReadUrlSchema,type CostEvidenceFinalizeInput,type CostEvidenceReadUrlInput } from '../../../../shared/schemas/costs/cost-evidence'
import {workflowQuotationRecoveryInputSchema,workflowRecoverableQuotationSchema,workflowRecoverableQuotationsSchema,type WorkflowQuotationRecoveryInput,type WorkflowEvidenceIntent,type WorkflowEvidenceLink} from '../../../../shared/schemas/costs/cost-workflow-evidence'
import { workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import type { UserSupabaseClient,SupabaseEvidenceFinalizer } from '../../../utils/supabase-client'
import { AppApiError } from '../../../utils/api-error'
import { CostEvidenceRepository } from '../evidence/cost-evidence.repository'
import type { WorkflowEvidenceContext,WorkflowEvidenceRepository } from './cost-workflow-evidence.service'
import { SupabaseWorkflowRepository,workflowResponse } from './cost-workflow.repository'
import { SupabaseCostExtractionRepository } from '../extraction/cost-extraction.repository'
type Result={data:unknown;error:unknown}
interface RecoveryQuery {
 select(columns:string):RecoveryQuery
 eq(column:string,value:string|boolean):RecoveryQuery
 is(column:string,value:null):RecoveryQuery
 in(column:string,values:readonly string[]):RecoveryQuery
 gte(column:string,value:string|number):RecoveryQuery
 lte(column:string,value:string|number):RecoveryQuery
 order(column:string,options:{ascending:boolean}):RecoveryQuery
 limit(count:number):PromiseLike<Result>
}
interface Client {from(table:'cost_evidence_files'):RecoveryQuery;rpc(name:string,args:Record<string,unknown>):Promise<Result>;storage:{from(bucket:string):{createSignedUrl(path:string,expires:number,options:{download:boolean}):Promise<Result>}}}
const recoveryRowSchema=z.object({
 id:workflowRecoverableQuotationSchema.shape.id,version:workflowRecoverableQuotationSchema.shape.version,
 original_filename:workflowRecoverableQuotationSchema.shape.originalFilename,verified_mime_type:workflowRecoverableQuotationSchema.shape.mimeType,
 verified_size_bytes:workflowRecoverableQuotationSchema.shape.sizeBytes,verified_sha256:workflowRecoverableQuotationSchema.shape.sha256,
 finalized_at:workflowRecoverableQuotationSchema.shape.finalizedAt,
 tenant_id:workflowUuidSchema,company_id:workflowUuidSchema,project_id:workflowUuidSchema,created_by:workflowUuidSchema,
 workflow_origin:z.literal(true),workflow_target_kind:z.literal('request'),workflow_target_id:workflowUuidSchema.nullable(),
 workflow_evidence_kind:z.literal('quotation'),status:z.literal('finalized'),
}).strict()
const recoveryRowsSchema=z.array(recoveryRowSchema).max(20).refine(rows=>new Set(rows.map(row=>row.id)).size===rows.length,'Duplicate quotation identity')
const recoveryColumns='id,version,original_filename,verified_mime_type,verified_size_bytes,verified_sha256,finalized_at,tenant_id,company_id,project_id,created_by,workflow_origin,workflow_target_kind,workflow_target_id,workflow_evidence_kind,status'
const partySchema=z.object({id:workflowUuidSchema,name:z.string().min(1),kind:z.enum(['organization','crew']),crewOwnership:z.enum(['vqh_internal','external']).nullable()}).strict()
const linkResult=z.object({requestId:workflowUuidSchema,version:z.number().int().nonnegative(),replayed:z.boolean()}).strict()
function response<T>(result:Result,schema:z.ZodType<T>):T{
 if(result.error){const error=z.object({message:z.string()}).safeParse(result.error);const code=error.success?error.data.message:'INTERNAL_ERROR';const statuses:Record<string,number>={PERMISSION_DENIED:403,RESOURCE_NOT_FOUND:404,INPUT_INVALID:400,PROJECT_COMPLETED:409,VERSION_CONFLICT:409,IDEMPOTENCY_CONFLICT:409,EVIDENCE_UPLOAD_MISMATCH:409,WORKFLOW_NOT_ACTIVE:409};const accepted=apiErrorCodeSchema.safeParse(code);throw new AppApiError(accepted.success ? statuses[code]??500 : 500,accepted.success ? accepted.data : 'INTERNAL_ERROR','Không thể xử lý chứng từ.')}
 const parsed=schema.safeParse(result.data);if(!parsed.success)throw new AppApiError(500,'INTERNAL_ERROR','Phản hồi chứng từ không hợp lệ.');return parsed.data
}
export class SupabaseWorkflowEvidenceRepository implements WorkflowEvidenceRepository {
 private readonly client:Client
 private readonly original:CostEvidenceRepository
 private readonly workflow:SupabaseWorkflowRepository
 private readonly extraction:SupabaseCostExtractionRepository
 constructor(client:UserSupabaseClient,finalizer?:SupabaseEvidenceFinalizer){this.client=client as unknown as Client;this.original=new CostEvidenceRepository(client,finalizer);this.workflow=new SupabaseWorkflowRepository(client);this.extraction=new SupabaseCostExtractionRepository(client)}
 async listRecoverableQuotations(context:WorkflowEvidenceContext,projectId:string,input:WorkflowQuotationRecoveryInput){
  const parsed=workflowQuotationRecoveryInputSchema.safeParse(input)
  if(!parsed.success)throw new AppApiError(400,'INPUT_INVALID','Dữ liệu báo giá không hợp lệ.')
  const project=await this.workflow.readProjectContext(context,projectId)
  if(project.mode!=='document_backed_v1')throw new AppApiError(409,'WORKFLOW_NOT_ACTIVE','Quy trình chứng từ chưa được kích hoạt.')
  if(project.operationalState!=='active'||!project.canSubmit)throw new AppApiError(403,'PERMISSION_DENIED','Không thể chuẩn bị chứng từ cho dự án này.')
  if(input.requestId!==null){
   const request=await this.workflow.readRequest(context,projectId,input.requestId)
   if(request.id!==input.requestId||request.version!==input.requestVersion||!['working','returned'].includes(request.status))throw new AppApiError(409,'VERSION_CONFLICT','Yêu cầu chi phí đã thay đổi.')
  }
  const now=Date.now(),cutoff=now-30*24*60*60*1000
  let query=this.client.from('cost_evidence_files').select(recoveryColumns)
   .eq('tenant_id',context.tenantId).eq('company_id',context.companyId).eq('project_id',projectId).eq('created_by',context.actorId)
   .eq('workflow_origin',true).eq('workflow_target_kind','request')
  query=input.requestId===null?query.is('workflow_target_id',null):query.eq('workflow_target_id',input.requestId)
  const rows=workflowResponse(await query.eq('workflow_evidence_kind','quotation').eq('status','finalized')
   .in('verified_mime_type',['application/pdf','image/png','image/jpeg']).gte('verified_size_bytes',1).lte('verified_size_bytes',4000000)
   .gte('finalized_at',new Date(cutoff).toISOString()).lte('finalized_at',new Date(now).toISOString())
   .order('finalized_at',{ascending:false}).order('id',{ascending:true}).limit(20),recoveryRowsSchema)
  for(const row of rows){
   const finalizedTime=Date.parse(row.finalized_at)
   if(row.tenant_id!==context.tenantId||row.company_id!==context.companyId||row.project_id!==projectId||row.created_by!==context.actorId||row.workflow_target_id!==input.requestId||finalizedTime<cutoff||finalizedTime>now)throw new AppApiError(500,'INTERNAL_ERROR','Phạm vi báo giá không hợp lệ.')
  }
  for(const row of rows){
   const target=await this.extraction.readTarget(context,projectId,input.requestId,row.id)
   if(target.fileVersion!==row.version||target.sha256!==row.verified_sha256||target.mimeType!==row.verified_mime_type||target.sizeBytes!==row.verified_size_bytes||target.documentKind!=='quotation'||target.requestVersion!==input.requestVersion)throw new AppApiError(409,'VERSION_CONFLICT','Báo giá hoặc yêu cầu chi phí đã thay đổi.')
  }
  return workflowRecoverableQuotationsSchema.parse(rows.map(row=>({id:row.id,version:row.version,originalFilename:row.original_filename,mimeType:row.verified_mime_type,sizeBytes:row.verified_size_bytes,sha256:row.verified_sha256,finalizedAt:row.finalized_at,kind:'quotation'})))
 }
 async createIntent(context:WorkflowEvidenceContext,projectId:string,input:WorkflowEvidenceIntent,key:string){return response(await this.client.rpc('c1_workflow_create_evidence_intent',{target_company_id:context.companyId,target_project_id:projectId,target_input:input,target_idempotency_key:key,target_request_id:context.requestId}),costEvidenceUploadIntentSchema)}
 async finalize(context:WorkflowEvidenceContext,projectId:string,fileId:string,input:CostEvidenceFinalizeInput,key:string){
  response(await this.client.rpc('c1_workflow_evidence_finalization_target',{target_company_id:context.companyId,target_project_id:projectId,target_id:fileId}),z.object({id:workflowUuidSchema}).strict())
  return this.original.finalize(context,fileId,input,key)
 }
 async linkRequestEvidence(context:WorkflowEvidenceContext,projectId:string,requestId:string,input:WorkflowEvidenceLink,key:string){return response(await this.client.rpc('c1_workflow_link_request_evidence',{target_company_id:context.companyId,target_project_id:projectId,target_id:requestId,target_input:input,target_idempotency_key:key,target_request_id:context.requestId}),linkResult)}
 async createReadUrl(context:WorkflowEvidenceContext,projectId:string,fileId:string,input:CostEvidenceReadUrlInput){
  const target=response(await this.client.rpc('c1_workflow_evidence_read_target',{target_company_id:context.companyId,target_project_id:projectId,target_id:fileId}),z.object({bucketId:z.literal('c1-accounting-evidence'),objectPath:z.string().min(1)}).strict())
  const signed=response(await this.client.storage.from(target.bucketId).createSignedUrl(target.objectPath,60,{download:input.disposition==='attachment'}),z.object({signedUrl:z.string().url()}).passthrough())
  return costEvidenceReadUrlSchema.parse({url:signed.signedUrl,expiresAt:new Date(Date.now()+60000).toISOString()})
 }
 async listWorkflowParties(context:WorkflowEvidenceContext,projectId:string){return response(await this.client.rpc('c1_workflow_list_parties',{target_company_id:context.companyId,target_project_id:projectId}),z.array(partySchema))}
}
