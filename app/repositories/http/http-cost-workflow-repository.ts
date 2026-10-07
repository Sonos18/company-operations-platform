import {z} from 'zod'
import {costRequestInputSchema,workflowUpdateRequestInputSchema,workflowCommandVersionSchema,workflowDecisionInputSchema,workflowManagerAssignmentSchema,contractBasisInputSchema,contractAdjustmentInputSchema,cashAdjustmentInputSchema,workflowPaymentInputSchema,workflowRefundConfirmationSchema,workflowCommandResultSchema,costRequestViewSchema,workflowContractViewSchema,workflowAdjustmentViewSchema,workflowProjectContextSchema,workflowNotificationViewSchema,workflowUuidSchema,workflowDirectoryQuerySchema,workflowDirectorySchema,workflowRequestHistorySchema,workflowSourceSubcontractOptionSchema} from '../../../shared/schemas/costs/cost-workflow'
import {workflowEvidenceIntentSchema,workflowEvidenceLinkSchema} from '../../../shared/schemas/costs/cost-workflow-evidence'
import {costEvidenceUploadIntentSchema,costEvidenceFinalizeInputSchema,costEvidenceFinalizedSchema,costEvidenceReadUrlInputSchema,costEvidenceReadUrlSchema} from '../../../shared/schemas/costs/cost-evidence'
import {workflowFinanceSchema,workflowInventorySchema} from '../../../shared/schemas/costs/cost-workflow-reporting'
import {costExtractionCommandSchema,costExtractionViewSchema} from '../../../shared/schemas/costs/cost-extraction'
import type {CostWorkflowRepository,WorkflowCommand} from '../cost-workflow.contracts'
import type {AuthenticatedHttpClient} from './authenticated-http-client'
const party=z.object({id:workflowUuidSchema,name:z.string().min(1),kind:z.enum(['organization','crew']),crewOwnership:z.enum(['vqh_internal','external']).nullable()}).strict()
export function createHttpCostWorkflowRepository(options:{companyId:string|(()=>string|null);client:AuthenticatedHttpClient}):CostWorkflowRepository{
 function base(){const value=typeof options.companyId==='function'?options.companyId():options.companyId;if(!workflowUuidSchema.safeParse(value).success)throw new Error('ACTIVE_COMPANY_REQUIRED');return '/api/companies/'+encodeURIComponent(value!)}
 function scoped(p:string){return base()+'/projects/'+encodeURIComponent(workflowUuidSchema.parse(p))+'/cost-workflow'}
 const id=(value:string)=>encodeURIComponent(workflowUuidSchema.parse(value))
 async function read<T>(p:string,path:string,schema:z.ZodType<T>){const url=scoped(p)+path;return options.client.request({url,method:'GET',schema})}
 async function command<I,T>(p:string,path:string,input:I,inputSchema:z.ZodType<I>,schema:z.ZodType<T>,key:WorkflowCommand,method:'POST'|'PATCH'|'PUT'='POST'){
  const url=scoped(p)+path,body=inputSchema.parse(input),idempotencyKey=workflowUuidSchema.parse(key.idempotencyKey)
  return options.client.request({url,method,body,idempotencyKey,schema})
 }
 const repo:CostWorkflowRepository={
  async readDirectory(query){const url=base()+'/cost-workflow/projects',parsed=workflowDirectoryQuerySchema.parse(query??{}),params=new URLSearchParams();for(const [k,v] of Object.entries(parsed))if(v!==undefined)params.set(k,String(v));return options.client.request({url:url+'?'+params.toString(),method:'GET',schema:workflowDirectorySchema})},
  assignManager:(p,input,key)=>command(p,'/manager',input,workflowManagerAssignmentSchema,workflowCommandResultSchema,key,'PUT'),
  createRequest:(p,input,key)=>command(p,'/requests',input,costRequestInputSchema,workflowCommandResultSchema,key),
  updateRequest:(p,target,input,key)=>command(p,'/requests/'+id(target),input,workflowUpdateRequestInputSchema,workflowCommandResultSchema,key,'PATCH'),
  submitRequest:(p,target,input,key)=>command(p,'/requests/'+id(target)+'/submit',input,workflowCommandVersionSchema,workflowCommandResultSchema,key),
  decideRequest:(p,target,input,key)=>command(p,'/requests/'+id(target)+'/decisions',input,workflowDecisionInputSchema,workflowCommandResultSchema,key),
  createContractBasis:(p,input,key)=>command(p,'/contracts',input,contractBasisInputSchema,workflowCommandResultSchema,key),
  submitContractAdjustment:(p,target,input,key)=>command(p,'/contracts/'+id(target)+'/adjustments',input,contractAdjustmentInputSchema,workflowCommandResultSchema,key),
  decideContractAdjustment:(p,contract,target,input,key)=>command(p,'/contracts/'+id(contract)+'/adjustments/'+id(target)+'/decisions',input,workflowDecisionInputSchema,workflowCommandResultSchema,key),
  listRequests:p=>read(p,'/requests',z.array(costRequestViewSchema)),
  readRequest:(p,target)=>read(p,'/requests/'+id(target),costRequestViewSchema),
  readRequestHistory:(p,target)=>read(p,'/requests/'+id(target)+'/history',workflowRequestHistorySchema),
  listSourceSubcontracts:p=>read(p,'/source-subcontracts',z.array(workflowSourceSubcontractOptionSchema)),
  listContracts:p=>read(p,'/contracts',z.array(workflowContractViewSchema)),
  readContract:(p,target)=>read(p,'/contracts/'+id(target),workflowContractViewSchema),
  listAdjustments:p=>read(p,'/adjustments',z.array(workflowAdjustmentViewSchema)),
  readAdjustment:(p,target)=>read(p,'/adjustments/'+id(target),workflowAdjustmentViewSchema),
  readProjectContext:p=>read(p,'/context',workflowProjectContextSchema),
  async listNotifications(){const url=base()+'/cost-notifications';return options.client.request({url,method:'GET',schema:z.array(workflowNotificationViewSchema)})},
  async markNotificationRead(target,key){const url=base()+'/cost-notifications/'+id(target)+'/read';return options.client.request({url,method:'POST',idempotencyKey:workflowUuidSchema.parse(key.idempotencyKey),schema:workflowCommandResultSchema})},
  listParties:p=>read(p,'/parties',z.array(party)),
  createEvidenceIntent:(p,input,key)=>command(p,'/evidence/upload-intents',input,workflowEvidenceIntentSchema,costEvidenceUploadIntentSchema,key),
  finalizeEvidence:(p,target,input,key)=>command(p,'/evidence/'+id(target)+'/finalize',input,costEvidenceFinalizeInputSchema,costEvidenceFinalizedSchema,key),
  linkEvidence:(p,target,input,key)=>command(p,'/requests/'+id(target)+'/evidence',input,workflowEvidenceLinkSchema,workflowCommandResultSchema,key),
  async readEvidenceUrl(p,target,input={disposition:'inline'}){const url=scoped(p)+'/evidence/'+id(target)+'/read-url';return options.client.request({url,method:'POST',body:costEvidenceReadUrlInputSchema.parse(input),schema:costEvidenceReadUrlSchema})},
  extractEvidence:(p,target,input,key)=>command(p,'/evidence/'+id(target)+'/extract',input,costExtractionCommandSchema,costExtractionViewSchema,key),
  confirmPayment:(p,target,input,key)=>command(p,'/installments/'+id(target)+'/payments',input,workflowPaymentInputSchema,workflowCommandResultSchema,key),
  createCashAdjustment:(p,target,input,key)=>command(p,'/payments/'+id(target)+'/adjustments',input,cashAdjustmentInputSchema,workflowCommandResultSchema,key),
  decideCashAdjustment:(p,target,input,key)=>command(p,'/adjustments/'+id(target)+'/decisions',input,workflowDecisionInputSchema,workflowCommandResultSchema,key),
  confirmRefund:(p,target,input,key)=>command(p,'/adjustments/'+id(target)+'/confirm-refund',input,workflowRefundConfirmationSchema,workflowCommandResultSchema,key),
  applyCashCorrection:(p,target,input,key)=>command(p,'/adjustments/'+id(target)+'/apply-correction',input,workflowCommandVersionSchema,workflowCommandResultSchema,key),
  readCash:p=>read(p,'/cash',workflowFinanceSchema),
  readInventory:p=>read(p,'/inventory',workflowInventorySchema),
 }
 return repo
}
