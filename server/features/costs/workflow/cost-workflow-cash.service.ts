import type {PermissionCode} from '../../../../shared/constants/permissions'
import {cashAdjustmentInputSchema,workflowCommandVersionSchema,workflowDecisionInputSchema,workflowPaymentInputSchema,workflowRefundConfirmationSchema,type CashAdjustmentInput,type WorkflowCommandResult,type WorkflowCommandVersion,type WorkflowDecisionInput,type WorkflowPaymentInput,type WorkflowRefundConfirmation} from '../../../../shared/schemas/costs/cost-workflow'
import {AppApiError} from '../../../utils/api-error'
import type {WorkflowContext} from './cost-workflow.service'
export interface WorkflowCashRepository {
 confirmPayment(c:WorkflowContext,p:string,id:string,input:WorkflowPaymentInput,key:string):Promise<WorkflowCommandResult>
 createCashAdjustment(c:WorkflowContext,p:string,id:string,input:CashAdjustmentInput,key:string):Promise<WorkflowCommandResult>
 decideCashAdjustment(c:WorkflowContext,p:string,id:string,input:WorkflowDecisionInput,key:string):Promise<WorkflowCommandResult>
 confirmRefund(c:WorkflowContext,p:string,id:string,input:WorkflowRefundConfirmation,key:string):Promise<WorkflowCommandResult>
 applyCashCorrection(c:WorkflowContext,p:string,id:string,input:WorkflowCommandVersion,key:string):Promise<WorkflowCommandResult>
}
function permission(c:WorkflowContext,code:PermissionCode){if(!c.permissions.includes(code))throw new AppApiError(403,'PERMISSION_DENIED','Bạn không có quyền thực hiện thao tác này.')}
function parse<T>(schema:{parse(value:unknown):T},input:unknown):T{try{return schema.parse(input)}catch{throw new AppApiError(400,'INPUT_INVALID','Dữ liệu thanh toán không hợp lệ.')}}
export class CostWorkflowCashService {
 constructor(private readonly repository:WorkflowCashRepository){}
 async confirmPayment(c:WorkflowContext,p:string,id:string,value:unknown,key:string){permission(c,'cost.record_cash');permission(c,'cost.request.submit');return this.repository.confirmPayment(c,p,id,parse(workflowPaymentInputSchema,value),key)}
 async createCashAdjustment(c:WorkflowContext,p:string,id:string,value:unknown,key:string){permission(c,'cost.correct');permission(c,'cost.request.submit');return this.repository.createCashAdjustment(c,p,id,parse(cashAdjustmentInputSchema,value),key)}
 async decideCashAdjustment(c:WorkflowContext,p:string,id:string,value:unknown,key:string){permission(c,'cost.request.decide');return this.repository.decideCashAdjustment(c,p,id,parse(workflowDecisionInputSchema,value),key)}
 async confirmRefund(c:WorkflowContext,p:string,id:string,value:unknown,key:string){permission(c,'cost.record_cash');permission(c,'cost.request.submit');return this.repository.confirmRefund(c,p,id,parse(workflowRefundConfirmationSchema,value),key)}
 async applyCashCorrection(c:WorkflowContext,p:string,id:string,value:unknown,key:string){permission(c,'cost.correct');permission(c,'cost.request.submit');return this.repository.applyCashCorrection(c,p,id,parse(workflowCommandVersionSchema,value),key)}
}
