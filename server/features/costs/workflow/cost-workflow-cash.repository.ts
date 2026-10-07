import type {UserSupabaseClient} from '../../../utils/supabase-client'
import {workflowCommandResultSchema} from '../../../../shared/schemas/costs/cost-workflow'
import type {WorkflowContext} from './cost-workflow.service'
import type {WorkflowCashRepository} from './cost-workflow-cash.service'
import {workflowResponse} from './cost-workflow.repository'
interface Client {rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>}
export class SupabaseWorkflowCashRepository implements WorkflowCashRepository {
 private readonly client:Client
 constructor(client:UserSupabaseClient){this.client=client as unknown as Client}
 private async command(c:WorkflowContext,p:string,id:string,name:string,input:unknown,key:string){return workflowResponse(await this.client.rpc(name,{target_company_id:c.companyId,target_project_id:p,target_id:id,target_input:input,target_idempotency_key:key,target_request_id:c.requestId}),workflowCommandResultSchema)}
 confirmPayment:WorkflowCashRepository['confirmPayment']=(c,p,id,input,key)=>this.command(c,p,id,'c1_workflow_confirm_payment',input,key)
 createCashAdjustment:WorkflowCashRepository['createCashAdjustment']=(c,p,id,input,key)=>this.command(c,p,id,'c1_workflow_create_cash_adjustment',input,key)
 decideCashAdjustment:WorkflowCashRepository['decideCashAdjustment']=(c,p,id,input,key)=>this.command(c,p,id,'c1_workflow_decide_cash_adjustment',input,key)
 confirmRefund:WorkflowCashRepository['confirmRefund']=(c,p,id,input,key)=>this.command(c,p,id,'c1_workflow_confirm_refund',input,key)
 applyCashCorrection:WorkflowCashRepository['applyCashCorrection']=(c,p,id,input,key)=>this.command(c,p,id,'c1_workflow_apply_cash_correction',input,key)
}
