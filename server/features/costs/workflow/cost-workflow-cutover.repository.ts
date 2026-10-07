import { z } from 'zod'
import { workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import { workflowCompanyCommandResultSchema,workflowClassificationResultSchema,workflowCutoverSnapshotSchema,workflowCutoverCrewsSchema } from '../../../../shared/schemas/costs/cost-workflow-cutover'
import type { UserSupabaseClient } from '../../../utils/supabase-client'
import { AppApiError } from '../../../utils/api-error'
import { workflowResponse } from './cost-workflow.repository'
import type { WorkflowContext } from './cost-workflow.service'
import type { WorkflowCutoverRepository } from './cost-workflow-cutover.service'
interface ReadQuery extends PromiseLike<{data:unknown;error:unknown;count:number|null}> {select(columns:string,options:{count:'exact'}):ReadQuery;eq(column:string,value:string|boolean):ReadQuery;order(column:string,options?:{ascending:boolean}):ReadQuery;limit(count:number):ReadQuery}
interface Client {rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>;from(table:string):ReadQuery}
const scope={tenant_id:workflowUuidSchema,company_id:workflowUuidSchema}
const version=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const partiesSchema=z.array(z.object({...scope,id:workflowUuidSchema,code:z.string().min(1),display_name:z.string().min(1),version}).strict()).max(1000)
const classificationsSchema=z.array(z.object({...scope,party_id:workflowUuidSchema,version,crew_ownership:z.enum(['vqh_internal','external']),reviewed_at:z.string().datetime({offset:true})}).strict()).max(10000)
export class SupabaseWorkflowCutoverRepository implements WorkflowCutoverRepository {
 private readonly client:Client
 constructor(client:UserSupabaseClient){this.client=client as unknown as Client}
 private async companyCommand(c:WorkflowContext,name:string,input:unknown,key:string){
  const result=workflowResponse(await this.client.rpc(name,{target_company_id:c.companyId,target_input:input,target_idempotency_key:key,target_request_id:c.requestId}),workflowCompanyCommandResultSchema)
  if(result.companyId!==c.companyId)throw new AppApiError(500,'INTERNAL_ERROR','Phản hồi phạm vi công ty không hợp lệ.')
  return result
 }
 configureCompany:WorkflowCutoverRepository['configureCompany']=(c,input,key)=>this.companyCommand(c,'c1_workflow_configure_company',input,key)
 activateCompany:WorkflowCutoverRepository['activateCompany']=(c,input,key)=>this.companyCommand(c,'c1_workflow_activate_company',input,key)
 classifyCrew:WorkflowCutoverRepository['classifyCrew']=async(c,partyId,input,key)=>workflowResponse(await this.client.rpc('c1_workflow_append_party_classification',{target_company_id:c.companyId,target_party_id:partyId,target_input:input,target_idempotency_key:key,target_request_id:c.requestId}),workflowClassificationResultSchema)
 readSnapshot:WorkflowCutoverRepository['readSnapshot']=async c=>{
  const result=workflowResponse(await this.client.rpc('c1_workflow_cutover_snapshot',{target_company_id:c.companyId}),workflowCutoverSnapshotSchema)
  if(result.companyId!==c.companyId)throw new AppApiError(500,'INTERNAL_ERROR','Phản hồi phạm vi công ty không hợp lệ.')
  return result
 }
 readCrews:WorkflowCutoverRepository['readCrews']=async c=>{
  const [partyResponse,classificationResponse]=await Promise.all([
   this.client.from('business_parties').select('id,tenant_id,company_id,code,display_name,version',{count:'exact'}).eq('tenant_id',c.tenantId).eq('company_id',c.companyId).eq('party_kind','crew').eq('is_active',true).order('code').limit(1000),
   this.client.from('cost_workflow_party_classifications').select('tenant_id,company_id,party_id,version,crew_ownership,reviewed_at',{count:'exact'}).eq('tenant_id',c.tenantId).eq('company_id',c.companyId).order('version',{ascending:false}).limit(10000),
  ])
  const parties=workflowResponse(partyResponse,partiesSchema),classifications=workflowResponse(classificationResponse,classificationsSchema)
  if(partyResponse.count!==parties.length||classificationResponse.count!==classifications.length||[...parties,...classifications].some(row=>row.tenant_id!==c.tenantId||row.company_id!==c.companyId))throw new AppApiError(500,'INTERNAL_ERROR','Không thể đọc đầy đủ danh sách đội thi công.')
  const latest=new Map<string,typeof classifications[number]>()
  for(const row of classifications)if(!latest.has(row.party_id))latest.set(row.party_id,row)
  return workflowCutoverCrewsSchema.parse(parties.map(p=>{const row=latest.get(p.id);return {id:p.id,code:p.code,name:p.display_name,partyVersion:p.version,classificationVersion:row?.version??0,crewOwnership:row?.crew_ownership??null,classificationReviewedAt:row?.reviewed_at??null}}))
 }
}
