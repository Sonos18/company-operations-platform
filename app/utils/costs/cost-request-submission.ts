import {costRequestInputSchema,type CostRequestInput,type WorkflowCommandResult} from '../../../shared/schemas/costs/cost-workflow'
import type {CostWorkflowRepository} from '../../repositories/cost-workflow.contracts'
export function createReviewedRequestSubmission(options:{projectId:string;repository:CostWorkflowRepository;isScopeCurrent:()=>boolean;initial?:{id:string;version:number}}){
 let requestId=options.initial?.id,version=options.initial?.version??0,appliedPayload=''
 let pendingWrite:{kind:'create'|'update';input:CostRequestInput;expectedVersion:number;key:string;payload:string}|undefined
 let pendingSubmit:{expectedVersion:number;key:string}|undefined
 let completed:{requestId:string;result:WorkflowCommandResult}|undefined
 const current=()=>{if(!options.isScopeCurrent())throw new Error('WORKFLOW_SCOPE_CHANGED')}
 return {get requestId(){return requestId},get version(){return version},async submit(value:unknown){
  current()
  const input=costRequestInputSchema.parse(value),payload=JSON.stringify(input)
  if(completed){if(payload!==appliedPayload)throw new Error('REQUEST_RESPONSE_UNCERTAIN');return completed}
  if((pendingWrite&&pendingWrite.payload!==payload)||(pendingSubmit&&appliedPayload!==payload))throw new Error('REQUEST_RESPONSE_UNCERTAIN')
  if(!pendingSubmit){
   if(!pendingWrite&&(!requestId||payload!==appliedPayload))pendingWrite={kind:requestId?'update':'create',input,expectedVersion:version,key:crypto.randomUUID(),payload}
   if(pendingWrite){
    const command=pendingWrite
    current()
    const result=command.kind==='create'
     ?await options.repository.createRequest(options.projectId,command.input,{idempotencyKey:command.key})
     :await options.repository.updateRequest(options.projectId,requestId!,{...command.input,expectedVersion:command.expectedVersion},{idempotencyKey:command.key})
    current()
    const receiptId=result.requestId??requestId
    if(!receiptId)throw new Error('WORKFLOW_REQUEST_RECEIPT_INVALID')
    requestId=receiptId;version=result.version;appliedPayload=command.payload;pendingWrite=undefined
   }
   if(!requestId)throw new Error('WORKFLOW_REQUEST_RECEIPT_INVALID')
   pendingSubmit={expectedVersion:version,key:crypto.randomUUID()}
  }
  current()
  const result=await options.repository.submitRequest(options.projectId,requestId!,{expectedVersion:pendingSubmit.expectedVersion},{idempotencyKey:pendingSubmit.key})
  current()
  completed={requestId:requestId!,result}
  pendingSubmit=undefined
  return completed
 }}
}
