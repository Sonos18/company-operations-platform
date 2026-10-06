import type { PermissionCode } from '../../../../shared/constants/permissions'
import { workflowDirectoryQuerySchema,type WorkflowDirectoryQuery,type WorkflowDirectory,type WorkflowRequestHistory,contractAdjustmentInputSchema,contractBasisInputSchema,costRequestInputSchema,workflowCommandVersionSchema,workflowDecisionInputSchema,workflowManagerAssignmentSchema,workflowUpdateRequestInputSchema,type ContractAdjustmentInput,type ContractBasisInput,type CostRequestInput,type CostRequestView,type WorkflowCommandResult,type WorkflowCommandVersion,type WorkflowContractView,type WorkflowDecisionInput,type WorkflowManagerAssignmentInput,type WorkflowNotificationView,type WorkflowUpdateRequestInput,type WorkflowAdjustmentView,type WorkflowProjectContext } from '../../../../shared/schemas/costs/cost-workflow'
import { AppApiError } from '../../../utils/api-error'
import type { WorkflowEvidenceContext } from './cost-workflow-evidence.service'
export type WorkflowContext=WorkflowEvidenceContext
export interface WorkflowRepository {
 readDirectory(c:WorkflowContext,query:WorkflowDirectoryQuery):Promise<WorkflowDirectory>
 readRequestHistory(c:WorkflowContext,p:string,id:string):Promise<WorkflowRequestHistory>
 assignManager(c:WorkflowContext,p:string,input:WorkflowManagerAssignmentInput,key:string):Promise<WorkflowCommandResult>
 createRequest(c:WorkflowContext,p:string,input:CostRequestInput,key:string):Promise<WorkflowCommandResult>
 updateRequest(c:WorkflowContext,p:string,id:string,input:WorkflowUpdateRequestInput,key:string):Promise<WorkflowCommandResult>
 submitRequest(c:WorkflowContext,p:string,id:string,input:WorkflowCommandVersion,key:string):Promise<WorkflowCommandResult>
 decideRequest(c:WorkflowContext,p:string,id:string,input:WorkflowDecisionInput,key:string):Promise<WorkflowCommandResult>
 createContractBasis(c:WorkflowContext,p:string,input:ContractBasisInput,key:string):Promise<WorkflowCommandResult>
 submitContractAdjustment(c:WorkflowContext,p:string,id:string,input:ContractAdjustmentInput,key:string):Promise<WorkflowCommandResult>
 decideContractAdjustment(c:WorkflowContext,p:string,contractId:string,id:string,input:WorkflowDecisionInput,key:string):Promise<WorkflowCommandResult>
 readProjectContext(c:WorkflowContext,p:string):Promise<WorkflowProjectContext>
 listContracts(c:WorkflowContext,p:string):Promise<WorkflowContractView[]>
 listAdjustments(c:WorkflowContext,p:string):Promise<WorkflowAdjustmentView[]>
 readAdjustment(c:WorkflowContext,p:string,id:string):Promise<WorkflowAdjustmentView>
 listRequests(c:WorkflowContext,p:string):Promise<CostRequestView[]>
 readRequest(c:WorkflowContext,p:string,id:string):Promise<CostRequestView>
 readContract(c:WorkflowContext,p:string,id:string):Promise<WorkflowContractView>
 listNotifications(c:WorkflowContext):Promise<WorkflowNotificationView[]>
 markNotificationRead(c:WorkflowContext,id:string,key:string):Promise<WorkflowCommandResult>
}
function permission(c:WorkflowContext,code:PermissionCode){if(!c.permissions.includes(code))throw new AppApiError(403,'PERMISSION_DENIED','Bạn không có quyền thực hiện thao tác này.')}
function parse<T>(schema:{parse(value:unknown):T},value:unknown):T{try{return schema.parse(value)}catch{throw new AppApiError(400,'INPUT_INVALID','Dữ liệu yêu cầu không hợp lệ.')}}
export class CostWorkflowService {
 constructor(private readonly repository:WorkflowRepository){}
 async readDirectory(c:WorkflowContext,value:unknown){if(!c.permissions.includes('cost.read')&&!c.permissions.includes('cost.request.read'))permission(c,'cost.request.read');return this.repository.readDirectory(c,parse(workflowDirectoryQuerySchema,value))}
 async readRequestHistory(c:WorkflowContext,p:string,id:string){permission(c,'cost.request.read');return this.repository.readRequestHistory(c,p,id)}
 async assignManager(c:WorkflowContext,p:string,value:unknown,key:string){permission(c,'project.cost_manager.assign');return this.repository.assignManager(c,p,parse(workflowManagerAssignmentSchema,value),key)}
 async createRequest(c:WorkflowContext,p:string,value:unknown,key:string){permission(c,'cost.request.submit');return this.repository.createRequest(c,p,parse(costRequestInputSchema,value),key)}
 async updateRequest(c:WorkflowContext,p:string,id:string,value:unknown,key:string){permission(c,'cost.request.submit');return this.repository.updateRequest(c,p,id,parse(workflowUpdateRequestInputSchema,value),key)}
 async submitRequest(c:WorkflowContext,p:string,id:string,value:unknown,key:string){permission(c,'cost.request.submit');return this.repository.submitRequest(c,p,id,parse(workflowCommandVersionSchema,value),key)}
 async decideRequest(c:WorkflowContext,p:string,id:string,value:unknown,key:string){permission(c,'cost.request.decide');return this.repository.decideRequest(c,p,id,parse(workflowDecisionInputSchema,value),key)}
 async createContractBasis(c:WorkflowContext,p:string,value:unknown,key:string){permission(c,'cost.request.submit');return this.repository.createContractBasis(c,p,parse(contractBasisInputSchema,value),key)}
 async submitContractAdjustment(c:WorkflowContext,p:string,id:string,value:unknown,key:string){permission(c,'cost.request.submit');return this.repository.submitContractAdjustment(c,p,id,parse(contractAdjustmentInputSchema,value),key)}
 async decideContractAdjustment(c:WorkflowContext,p:string,contractId:string,id:string,value:unknown,key:string){permission(c,'cost.request.decide');return this.repository.decideContractAdjustment(c,p,contractId,id,parse(workflowDecisionInputSchema,value),key)}
 async readProjectContext(c:WorkflowContext,p:string){permission(c,'cost.request.read');return this.repository.readProjectContext(c,p)}
 async listContracts(c:WorkflowContext,p:string){permission(c,'cost.request.read');return this.repository.listContracts(c,p)}
 async listAdjustments(c:WorkflowContext,p:string){permission(c,'cost.request.read');return this.repository.listAdjustments(c,p)}
 async readAdjustment(c:WorkflowContext,p:string,id:string){permission(c,'cost.request.read');return this.repository.readAdjustment(c,p,id)}
 async listRequests(c:WorkflowContext,p:string){permission(c,'cost.request.read');return this.repository.listRequests(c,p)}
 async readRequest(c:WorkflowContext,p:string,id:string){permission(c,'cost.request.read');return this.repository.readRequest(c,p,id)}
 async readContract(c:WorkflowContext,p:string,id:string){permission(c,'cost.request.read');return this.repository.readContract(c,p,id)}
 async listNotifications(c:WorkflowContext){permission(c,'cost.notification.read');return this.repository.listNotifications(c)}
 async markNotificationRead(c:WorkflowContext,id:string,key:string){permission(c,'cost.notification.read');return this.repository.markNotificationRead(c,id,key)}
}
