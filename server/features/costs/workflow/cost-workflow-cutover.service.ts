import type { PermissionCode } from '../../../../shared/constants/permissions'
import { workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import { workflowCompanyConfigurationSchema, workflowCrewClassificationSchema, workflowCompanyActivationSchema, type WorkflowCompanyConfiguration, type WorkflowCrewClassification, type WorkflowCompanyActivation, type WorkflowCompanyCommandResult, type WorkflowClassificationResult, type WorkflowCutoverSnapshot, type WorkflowCutoverCrew } from '../../../../shared/schemas/costs/cost-workflow-cutover'
import { AppApiError } from '../../../utils/api-error'
import type { WorkflowContext } from './cost-workflow.service'
export interface WorkflowCutoverRepository {
 configureCompany(c:WorkflowContext,input:WorkflowCompanyConfiguration,key:string):Promise<WorkflowCompanyCommandResult>
 classifyCrew(c:WorkflowContext,partyId:string,input:WorkflowCrewClassification,key:string):Promise<WorkflowClassificationResult>
 activateCompany(c:WorkflowContext,input:WorkflowCompanyActivation,key:string):Promise<WorkflowCompanyCommandResult>
 readSnapshot(c:WorkflowContext):Promise<WorkflowCutoverSnapshot>
 readCrews(c:WorkflowContext):Promise<WorkflowCutoverCrew[]>
}
function requirePermission(c:WorkflowContext,code:PermissionCode){if(!c.permissions.includes(code))throw new AppApiError(403,'PERMISSION_DENIED','Bạn không có quyền thực hiện thao tác này.')}
function parse<T>(schema:{parse(value:unknown):T},value:unknown):T{try{return schema.parse(value)}catch{throw new AppApiError(400,'INPUT_INVALID','Dữ liệu yêu cầu không hợp lệ.')}}
export class CostWorkflowCutoverService {
 constructor(private readonly repository:WorkflowCutoverRepository){}
 async configureCompany(c:WorkflowContext,value:unknown,key:string){requirePermission(c,'cost.config.manage');return this.repository.configureCompany(c,parse(workflowCompanyConfigurationSchema,value),parse(workflowUuidSchema,key))}
 async classifyCrew(c:WorkflowContext,partyId:string,value:unknown,key:string){requirePermission(c,'party.manage');return this.repository.classifyCrew(c,parse(workflowUuidSchema,partyId),parse(workflowCrewClassificationSchema,value),parse(workflowUuidSchema,key))}
 async activateCompany(c:WorkflowContext,value:unknown,key:string){requirePermission(c,'cost.config.manage');return this.repository.activateCompany(c,parse(workflowCompanyActivationSchema,value),parse(workflowUuidSchema,key))}
 async readSnapshot(c:WorkflowContext){requirePermission(c,'cost.config.manage');return this.repository.readSnapshot(c)}
 async readCrews(c:WorkflowContext){requirePermission(c,'party.manage');requirePermission(c,'cost.party.read');return this.repository.readCrews(c)}
}
