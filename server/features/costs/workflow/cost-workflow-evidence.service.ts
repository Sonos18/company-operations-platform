import type { PermissionCode } from '../../../../shared/constants/permissions'
import { costEvidenceFinalizeInputSchema, costEvidenceReadUrlInputSchema, type CostEvidenceFinalizeInput, type CostEvidenceReadUrlInput } from '../../../../shared/schemas/costs/cost-evidence'
import { workflowEvidenceIntentSchema, workflowEvidenceLinkSchema, workflowQuotationRecoveryInputSchema, workflowRecoverableQuotationsSchema, type WorkflowQuotationRecoveryInput, type WorkflowRecoverableQuotation, type WorkflowEvidenceIntent, type WorkflowEvidenceLink } from '../../../../shared/schemas/costs/cost-workflow-evidence'
import type { WorkflowPartyOption } from '../../../../shared/schemas/costs/cost-workflow'
import { AppApiError } from '../../../utils/api-error'
export interface WorkflowEvidenceContext {actorId:string;tenantId:string;companyId:string;requestId:string;permissions:readonly PermissionCode[]}
export interface WorkflowEvidenceRepository {
 listRecoverableQuotations(context:WorkflowEvidenceContext,projectId:string,input:WorkflowQuotationRecoveryInput):Promise<WorkflowRecoverableQuotation[]>
 createIntent(context:WorkflowEvidenceContext,projectId:string,input:WorkflowEvidenceIntent,key:string):Promise<unknown>
 finalize(context:WorkflowEvidenceContext,projectId:string,fileId:string,input:CostEvidenceFinalizeInput,key:string):Promise<unknown>
 linkRequestEvidence(context:WorkflowEvidenceContext,projectId:string,requestId:string,input:WorkflowEvidenceLink,key:string):Promise<unknown>
 createReadUrl(context:WorkflowEvidenceContext,projectId:string,fileId:string,input:CostEvidenceReadUrlInput):Promise<unknown>
 listWorkflowParties(context:WorkflowEvidenceContext,projectId:string):Promise<WorkflowPartyOption[]>
}
function requirePermission(context:WorkflowEvidenceContext,code:PermissionCode){if(!context.permissions.includes(code))throw new AppApiError(403,'PERMISSION_DENIED','Bạn không có quyền thực hiện thao tác này.')}
function parse<T>(schema:{parse(value:unknown):T},value:unknown):T{try{return schema.parse(value)}catch{throw new AppApiError(400,'INPUT_INVALID','Dữ liệu chứng từ không hợp lệ.')}}
export class CostWorkflowEvidenceService {
 constructor(private readonly repository:WorkflowEvidenceRepository){}
 async listRecoverableQuotations(context:WorkflowEvidenceContext,projectId:string,value:unknown){
  for(const code of ['cost.prepare','cost.request.submit','cost.request.file.read','cost.request.read'] as const)requirePermission(context,code)
  const result=await this.repository.listRecoverableQuotations(context,projectId,parse(workflowQuotationRecoveryInputSchema,value))
  const parsed=workflowRecoverableQuotationsSchema.safeParse(result)
  if(!parsed.success)throw new AppApiError(500,'INTERNAL_ERROR','Phản hồi báo giá không hợp lệ.')
  return parsed.data
 }
 async createIntent(context:WorkflowEvidenceContext,projectId:string,value:unknown,key:string){requirePermission(context,'cost.request.submit');requirePermission(context,'cost.prepare');return this.repository.createIntent(context,projectId,parse(workflowEvidenceIntentSchema,value),key)}
 async finalize(context:WorkflowEvidenceContext,projectId:string,fileId:string,value:unknown,key:string){requirePermission(context,'cost.request.submit');requirePermission(context,'cost.prepare');return this.repository.finalize(context,projectId,fileId,parse(costEvidenceFinalizeInputSchema,value),key)}
 async linkRequestEvidence(context:WorkflowEvidenceContext,projectId:string,requestId:string,value:unknown,key:string){requirePermission(context,'cost.request.submit');return this.repository.linkRequestEvidence(context,projectId,requestId,parse(workflowEvidenceLinkSchema,value),key)}
 async createReadUrl(context:WorkflowEvidenceContext,projectId:string,fileId:string,value:unknown){requirePermission(context,'cost.request.read');requirePermission(context,'cost.request.file.read');return this.repository.createReadUrl(context,projectId,fileId,parse(costEvidenceReadUrlInputSchema,value))}
 async listWorkflowParties(context:WorkflowEvidenceContext,projectId:string){requirePermission(context,'cost.party.read');return this.repository.listWorkflowParties(context,projectId)}
}
