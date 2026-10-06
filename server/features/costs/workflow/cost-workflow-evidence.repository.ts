import { z } from 'zod'
import { apiErrorCodeSchema } from '../../../../shared/schemas/api-error'
import { costEvidenceUploadIntentSchema,costEvidenceReadUrlSchema,type CostEvidenceFinalizeInput,type CostEvidenceReadUrlInput } from '../../../../shared/schemas/costs/cost-evidence'
import type { WorkflowEvidenceIntent,WorkflowEvidenceLink } from '../../../../shared/schemas/costs/cost-workflow-evidence'
import { workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import type { UserSupabaseClient,SupabaseEvidenceFinalizer } from '../../../utils/supabase-client'
import { AppApiError } from '../../../utils/api-error'
import { CostEvidenceRepository } from '../evidence/cost-evidence.repository'
import type { WorkflowEvidenceContext,WorkflowEvidenceRepository } from './cost-workflow-evidence.service'
type Result={data:unknown;error:unknown}
interface Client {rpc(name:string,args:Record<string,unknown>):Promise<Result>;storage:{from(bucket:string):{createSignedUrl(path:string,expires:number,options:{download:boolean}):Promise<Result>}}}
const partySchema=z.object({id:workflowUuidSchema,name:z.string().min(1),kind:z.enum(['organization','crew']),crewOwnership:z.enum(['vqh_internal','external']).nullable()}).strict()
const linkResult=z.object({requestId:workflowUuidSchema,version:z.number().int().nonnegative(),replayed:z.boolean()}).strict()
function response<T>(result:Result,schema:z.ZodType<T>):T{
 if(result.error){const error=z.object({message:z.string()}).safeParse(result.error);const code=error.success?error.data.message:'INTERNAL_ERROR';const statuses:Record<string,number>={PERMISSION_DENIED:403,RESOURCE_NOT_FOUND:404,INPUT_INVALID:400,PROJECT_COMPLETED:409,VERSION_CONFLICT:409,IDEMPOTENCY_CONFLICT:409,EVIDENCE_UPLOAD_MISMATCH:409,WORKFLOW_NOT_ACTIVE:409};const accepted=apiErrorCodeSchema.safeParse(code);throw new AppApiError(accepted.success ? statuses[code]??500 : 500,accepted.success ? accepted.data : 'INTERNAL_ERROR','Không thể xử lý chứng từ.')}
 const parsed=schema.safeParse(result.data);if(!parsed.success)throw new AppApiError(500,'INTERNAL_ERROR','Phản hồi chứng từ không hợp lệ.');return parsed.data
}
export class SupabaseWorkflowEvidenceRepository implements WorkflowEvidenceRepository {
 private readonly client:Client
 private readonly original:CostEvidenceRepository
 constructor(client:UserSupabaseClient,finalizer?:SupabaseEvidenceFinalizer){this.client=client as unknown as Client;this.original=new CostEvidenceRepository(client,finalizer)}
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
