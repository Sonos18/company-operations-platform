import { z } from 'zod'
import { apiErrorCodeSchema } from '../../../../shared/schemas/api-error'
import { costRequestViewSchema,workflowAdjustmentViewSchema,workflowCommandResultSchema,workflowContractViewSchema,workflowNotificationViewSchema,workflowProjectContextSchema } from '../../../../shared/schemas/costs/cost-workflow'
import type { UserSupabaseClient } from '../../../utils/supabase-client'
import { AppApiError } from '../../../utils/api-error'
import type { WorkflowContext,WorkflowRepository } from './cost-workflow.service'
type RpcResult={data:unknown;error:unknown}
interface Client {rpc(name:string,args:Record<string,unknown>):Promise<RpcResult>}
export function workflowResponse<T>(result:RpcResult,schema:z.ZodType<T>):T{
 if(result.error){const error=z.object({message:z.string()}).safeParse(result.error);const accepted=apiErrorCodeSchema.safeParse(error.success?error.data.message:'INTERNAL_ERROR');const code=accepted.success?accepted.data:'INTERNAL_ERROR';const status=code==='PERMISSION_DENIED'?403:code==='RESOURCE_NOT_FOUND'?404:code==='INPUT_INVALID'?400:code==='INTERNAL_ERROR'?500:409;throw new AppApiError(status,code,'Không thể xử lý yêu cầu chi phí.')}
 const parsed=schema.safeParse(result.data);if(!parsed.success)throw new AppApiError(500,'INTERNAL_ERROR','Phản hồi yêu cầu chi phí không hợp lệ.');return parsed.data
}
export class SupabaseWorkflowRepository implements WorkflowRepository {
 private readonly client:Client
 constructor(client:UserSupabaseClient){this.client=client as unknown as Client}
 private async command(c:WorkflowContext,p:string|undefined,name:string,input:unknown,key:string,targets:Record<string,unknown>={}){
  return workflowResponse(await this.client.rpc(name,{target_company_id:c.companyId,...(p?{target_project_id:p}:{}),...targets,target_input:input,target_idempotency_key:key,target_request_id:c.requestId}),workflowCommandResultSchema)
 }
 private async read<T>(c:WorkflowContext,p:string|undefined,name:string,schema:z.ZodType<T>,targets:Record<string,unknown>={}){
  return workflowResponse(await this.client.rpc(name,{target_company_id:c.companyId,...(p?{target_project_id:p}:{}),...targets}),schema)
 }
 assignManager:WorkflowRepository['assignManager']=(c,p,input,key)=>this.command(c,p,'c1_workflow_assign_manager',input,key)
 createRequest:WorkflowRepository['createRequest']=(c,p,input,key)=>this.command(c,p,'c1_workflow_create_request',input,key)
 updateRequest:WorkflowRepository['updateRequest']=(c,p,id,input,key)=>this.command(c,p,'c1_workflow_update_request',input,key,{target_id:id})
 submitRequest:WorkflowRepository['submitRequest']=(c,p,id,input,key)=>this.command(c,p,'c1_workflow_submit_request',input,key,{target_id:id})
 decideRequest:WorkflowRepository['decideRequest']=(c,p,id,input,key)=>this.command(c,p,'c1_workflow_decide_request',input,key,{target_id:id})
 createContractBasis:WorkflowRepository['createContractBasis']=(c,p,input,key)=>this.command(c,p,'c1_workflow_create_contract_basis',input,key)
 submitContractAdjustment:WorkflowRepository['submitContractAdjustment']=(c,p,id,input,key)=>this.command(c,p,'c1_workflow_submit_contract_adjustment',input,key,{target_id:id})
 decideContractAdjustment:WorkflowRepository['decideContractAdjustment']=(c,p,contractId,id,input,key)=>this.command(c,p,'c1_workflow_decide_contract_adjustment',input,key,{target_contract_id:contractId,target_id:id})
 listRequests:WorkflowRepository['listRequests']=(c,p)=>this.read(c,p,'c1_workflow_list_requests',z.array(costRequestViewSchema))
 readRequest:WorkflowRepository['readRequest']=(c,p,id)=>this.read(c,p,'c1_workflow_read_request',costRequestViewSchema,{target_id:id})
 listContracts:WorkflowRepository['listContracts']=(c,p)=>this.read(c,p,'c1_workflow_list_contracts',z.array(workflowContractViewSchema))
 readContract:WorkflowRepository['readContract']=(c,p,id)=>this.read(c,p,'c1_workflow_read_contract',workflowContractViewSchema,{target_id:id})
 listAdjustments:WorkflowRepository['listAdjustments']=(c,p)=>this.read(c,p,'c1_workflow_list_adjustments',z.array(workflowAdjustmentViewSchema))
 readAdjustment:WorkflowRepository['readAdjustment']=(c,p,id)=>this.read(c,p,'c1_workflow_read_adjustment',workflowAdjustmentViewSchema,{target_id:id})
 readProjectContext:WorkflowRepository['readProjectContext']=(c,p)=>this.read(c,p,'c1_workflow_project_context',workflowProjectContextSchema)
 listNotifications:WorkflowRepository['listNotifications']=c=>this.read(c,undefined,'c1_workflow_list_notifications',z.array(workflowNotificationViewSchema))
 markNotificationRead:WorkflowRepository['markNotificationRead']=(c,id,key)=>this.command(c,undefined,'c1_workflow_read_notification',{},key,{target_id:id})
}
