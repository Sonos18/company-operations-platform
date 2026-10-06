import {costExtractionCommandSchema} from '../../../shared/schemas/costs/cost-extraction'
import type {CostWorkflowRepository} from '../../repositories/cost-workflow.contracts'
type Command=Parameters<CostWorkflowRepository['extractEvidence']>[2]
/** Preserve the original command after a lost response; changed scope or payload
 * cannot turn its retry into a different extraction/persistence operation.
 */
export function createEvidenceExtractionSession(options:{projectId:string;repository:Pick<CostWorkflowRepository,'extractEvidence'>;isScopeCurrent:()=>boolean;key?:()=>string}){
 let pending:{fileId:string;input:Readonly<Command>;key:string}|null=null
 return {
  get pendingFileId(){return pending?.fileId??null},
  async scan(fileId:string,input:Command){
   if(!options.isScopeCurrent())throw new Error('EXTRACTION_SCOPE_CHANGED')
   const parsed=costExtractionCommandSchema.parse(input)
   if(pending&&(pending.fileId!==fileId||JSON.stringify(pending.input)!==JSON.stringify(parsed)))throw new Error('EXTRACTION_COMMAND_PENDING')
   pending??={fileId,input:Object.freeze(parsed),key:options.key?.()??crypto.randomUUID()}
   const command=pending
   const result=await options.repository.extractEvidence(options.projectId,command.fileId,command.input,{idempotencyKey:command.key})
   if(!options.isScopeCurrent())throw new Error('EXTRACTION_SCOPE_CHANGED')
   pending=null
   return result
  },
 }
}
