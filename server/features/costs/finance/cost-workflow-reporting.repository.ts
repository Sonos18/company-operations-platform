import type {UserSupabaseClient} from '../../../utils/supabase-client'
import {workflowCashSnapshotSchema,workflowInventorySchema} from '../../../../shared/schemas/costs/cost-workflow-reporting'
import {workflowCommandResultSchema} from '../../../../shared/schemas/costs/cost-workflow'
import {workflowResponse} from '../workflow/cost-workflow.repository'
import {projectWorkflowCash} from './cost-workflow-summary'
import type {WorkflowReportingRepository} from './cost-workflow-reporting.service'
interface Client{rpc(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>}
export class SupabaseWorkflowReportingRepository implements WorkflowReportingRepository{
 private readonly client:Client
 constructor(client:UserSupabaseClient){this.client=client as unknown as Client}
 readWorkflowCash:WorkflowReportingRepository['readWorkflowCash']=async(c,p)=>projectWorkflowCash(workflowResponse(await this.client.rpc('c1_workflow_cash_snapshot',{target_company_id:c.companyId,target_project_id:p}),workflowCashSnapshotSchema))
 readInventory:WorkflowReportingRepository['readInventory']=async(c,p)=>workflowResponse(await this.client.rpc('c1_workflow_inventory',{target_company_id:c.companyId,target_project_id:p}),workflowInventorySchema)
 reconcileLegacyCash:WorkflowReportingRepository['reconcileLegacyCash']=async(c,p,input,key)=>workflowResponse(await this.client.rpc('c1_workflow_reconcile_legacy_cash',{target_company_id:c.companyId,target_project_id:p,target_input:input,target_idempotency_key:key,target_request_id:c.requestId}),workflowCommandResultSchema)
}
