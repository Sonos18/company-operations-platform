import {AppApiError} from '../../../utils/api-error'
import type {WorkflowContext} from '../workflow/cost-workflow.service'
import {reconcileLegacyCashInputSchema,type ReconcileLegacyCashInput,type WorkflowFinance,type WorkflowInventory} from '../../../../shared/schemas/costs/cost-workflow-reporting'
import type {WorkflowCommandResult} from '../../../../shared/schemas/costs/cost-workflow'
export interface WorkflowReportingRepository {
 readWorkflowCash(c:WorkflowContext,p:string):Promise<WorkflowFinance>
 readInventory(c:WorkflowContext,p:string):Promise<WorkflowInventory>
 reconcileLegacyCash(c:WorkflowContext,p:string,input:ReconcileLegacyCashInput,key:string):Promise<WorkflowCommandResult>
}
export class CostWorkflowReportingService{
 constructor(private readonly repository:WorkflowReportingRepository){}
 private readPermission(c:WorkflowContext){if(!c.permissions.includes('cost.request.read'))throw new AppApiError(403,'PERMISSION_DENIED','Bạn không có quyền xem báo cáo chi phí.')}
 async readWorkflowCash(c:WorkflowContext,p:string){this.readPermission(c);return this.repository.readWorkflowCash(c,p)}
 async readInventory(c:WorkflowContext,p:string){this.readPermission(c);return this.repository.readInventory(c,p)}
 async reconcileLegacyCash(c:WorkflowContext,p:string,input:unknown,key:string){
  if(!c.permissions.includes('cost.record_cash')||!c.permissions.includes('cost.coverage.assert'))throw new AppApiError(403,'PERMISSION_DENIED','Bạn không có quyền xác nhận đối chiếu lịch sử.')
  const value=reconcileLegacyCashInputSchema.safeParse(input);if(!value.success)throw new AppApiError(400,'INPUT_INVALID','Dữ liệu đối chiếu lịch sử không hợp lệ.')
  return this.repository.reconcileLegacyCash(c,p,value.data,key)
 }
}
