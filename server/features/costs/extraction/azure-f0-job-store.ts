import {createHash} from 'node:crypto'
import {z} from 'zod'
import {costExtractionResultSchema,type ExtractionResult} from '../../../../shared/schemas/costs/cost-extraction'
import type {AzureF0Job,AzureF0JobStore} from './azure-f0-cost-extraction'
const resource='taskovia-doc-intelligence-dev.cognitiveservices.azure.com'
const hash=z.string().regex(/^[0-9a-f]{64}$/)
const bindingSchema=z.object({
 actorId:z.string().uuid(),tenantId:z.string().uuid(),companyId:z.string().uuid(),projectId:z.string().uuid(),
 fileId:z.string().uuid(),fileVersion:z.number().int().positive(),sha256:hash,
 requestId:z.string().uuid().nullable(),requestVersion:z.number().int().nonnegative().nullable(),
}).strict().refine(v=>(v.requestId===null)===(v.requestVersion===null))
export type AzureF0Binding=z.infer<typeof bindingSchema>
/** Only an already-approved private server client may implement this port. No client/key is constructed here. */
export interface AzureF0PrivateRpc{
 (name:'c1_cost_ocr_azure_f0_job',args:{p_command:string;p_binding:AzureF0Binding;p_payload:unknown}):PromiseLike<{data:unknown;error:unknown}>
}
const reservationSchema=z.object({
 key:hash,resourceId:z.literal(resource),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
 pages:z.number().int().min(1).max(2),limit:z.number().int().min(1).max(500),
 scope:z.object({companyId:z.string().uuid(),projectId:z.string().uuid()}).strict(),fileId:z.string().uuid(),sha256:hash,
 model:z.enum(['prebuilt-invoice','prebuilt-layout']),configurationVersion:z.string().min(1).max(100),
}).strict()
const leaseSchema=z.object({
 token:z.string().uuid(),resourceId:z.literal(resource),kind:z.enum(['post','get']),
 issuedAt:z.number().int().nonnegative().safe(),expiresAt:z.number().int().positive().safe(),
}).strict().refine(lease=>lease.expiresAt-lease.issuedAt===20_000)
const reviewed=costExtractionResultSchema.refine(v=>v.methodVersion==='azure-f0-v1'&&['needs_review','unavailable'].includes(v.status))
const jobSchema=z.object({
 key:hash,state:z.enum(['reserved','sending','submitted','uncertain','complete']),
 operationUrl:z.string().optional(),pollAfter:z.number().int().nonnegative().safe().optional(),
 result:reviewed.optional(),
}).strict().refine(j=>{
 if(j.state==='submitted'||j.state==='complete'){
  if(!j.operationUrl||j.pollAfter===undefined||!validOperation(j.operationUrl))return false
 }else if(j.operationUrl!==undefined||j.pollAfter!==undefined)return false
 return j.state==='complete'?j.result!==undefined:j.result===undefined
})
function validOperation(value:string,model?:string):boolean{
 try{
  const url=new URL(value),match=url.pathname.match(/^\/documentintelligence\/documentModels\/(prebuilt-invoice|prebuilt-layout)\/analyzeResults\/([0-9a-f-]{36})$/)
  return url.origin==='https://'+resource&&!url.username&&!url.password&&!url.hash&&url.searchParams.size===1&&url.searchParams.get('api-version')==='2024-11-30'&&!!match&&z.string().uuid().safeParse(match[2]).success&&(!model||model===match[1])&&url.href===value
 }catch{return false}
}
function checked<T>(schema:z.ZodType<T>,value:unknown,code='AZURE_STORE_INPUT_INVALID'):T{
 const parsed=schema.safeParse(value);if(!parsed.success)throw new Error(code);return parsed.data
}
function jsonSnapshot(value:unknown,maxBytes:number):unknown{
 try{
  const text=JSON.stringify(value)
  if(text===undefined||Buffer.byteLength(text)>maxBytes)throw new Error()
  return JSON.parse(text)
 }catch{throw new Error('AZURE_STORE_INPUT_INVALID')}
}
/** Request-bound RPC wrapper. The supplied closure MUST freshly re-read the user's target
 * and frozen actor/file/request versions on every call; service privilege is not user authorization.
 * SQL owns all clocks, locks, quota and job state. No local cache or automatic reconciliation.
 */
export function createAzureF0JobStore(options:{binding:AzureF0Binding;rpc:AzureF0PrivateRpc;authorize:()=>Promise<boolean>}):AzureF0JobStore{
 const binding=Object.freeze(checked(bindingSchema,options.binding))
 async function call(command:string,payload:unknown):Promise<unknown>{
  if(!await options.authorize())throw new Error('AZURE_STORE_SCOPE_CHANGED')
  let response:{data:unknown;error:unknown}
  try{response=await options.rpc('c1_cost_ocr_azure_f0_job',{p_command:command,p_binding:{...binding},p_payload:payload})}
  catch{throw new Error('AZURE_STORE_UNAVAILABLE')}
  if(!response||response.error)throw new Error('AZURE_STORE_UNAVAILABLE')
  if(!await options.authorize())throw new Error('AZURE_STORE_SCOPE_CHANGED')
  return response.data
 }
 async function ack(command:string,payload:unknown,requireSuccess=false):Promise<boolean>{
  const data=checked(z.object({ok:z.boolean()}).strict(),await call(command,payload),'AZURE_STORE_RESPONSE_INVALID')
  if(requireSuccess&&!data.ok)throw new Error('AZURE_STORE_CONFLICT')
  return data.ok
 }
 const keyPayload=(key:string)=>({key:checked(hash,key),resourceId:resource})
 return {
  durability:'persistent',
  async reserve(input){
   const value=checked(reservationSchema,input)
   const expected=createHash('sha256').update(JSON.stringify([resource,value.configurationVersion,binding.companyId,binding.projectId,binding.fileId,binding.sha256,value.model])).digest('hex')
   if(value.scope.companyId!==binding.companyId||value.scope.projectId!==binding.projectId||value.fileId!==binding.fileId||value.sha256!==binding.sha256||value.key!==expected)throw new Error('AZURE_STORE_INPUT_INVALID')
   const response=await call('reserve',value)
   const parsed=checked(z.union([z.object({blocked:z.enum(['quota','busy'])}).strict(),z.object({job:jobSchema}).strict()]),response,'AZURE_STORE_RESPONSE_INVALID')
   if('job' in parsed&&(parsed.job.key!==value.key||(parsed.job.operationUrl&&!validOperation(parsed.job.operationUrl,value.model))))throw new Error('AZURE_STORE_RESPONSE_INVALID')
   return parsed as {job:AzureF0Job}|{blocked:'quota'|'busy'}
  },
  claimSend(key){return ack('send',keyPayload(key))},
  async acquireDispatch(resourceId,kind){
   const payload=checked(z.object({resourceId:z.literal(resource),kind:z.enum(['post','get'])}).strict(),{resourceId,kind})
   const response=checked(z.object({lease:leaseSchema.nullable()}).strict(),await call('acquire',payload),'AZURE_STORE_RESPONSE_INVALID')
   if(response.lease&&response.lease.kind!==kind)throw new Error('AZURE_STORE_RESPONSE_INVALID')
   // Structural grant bookkeeping only: adapter/transport must check expiry immediately before dispatch.
   // Returning an expired token allows known-unused release; expiry never authorizes auto-regrant.
   return response.lease?Object.freeze(response.lease):null
  },
  async releaseDispatch(lease,outcome){
   const value=checked(leaseSchema,lease)
   const releaseOutcome=checked(z.enum(['settled','unused','uncertain']),outcome)
   // SQL binds token ownership to this frozen request binding, even after TTL expiry.
   // No local token cache, clock grant, automatic retry or guessed lease/quota reconciliation.
   await ack('release',{resourceId:value.resourceId,token:value.token,outcome:releaseOutcome},true)
  },
  async saveOperation(key,operationUrl,pollAfter){
   if(!validOperation(operationUrl)||!Number.isSafeInteger(pollAfter)||pollAfter<0||pollAfter>8_640_000_000_000_000)throw new Error('AZURE_STORE_INPUT_INVALID')
   await ack('operation',{...keyPayload(key),operationUrl,pollAfter},true)
  },
  async markUncertain(key){await ack('uncertain',keyPayload(key),true)},
  async complete(key,raw,result:ExtractionResult){
   const validated=checked(reviewed,result)
   await ack('complete',{...keyPayload(key),raw:jsonSnapshot(raw,4_000_000),result:jsonSnapshot(validated,300_000)},true)
  },
 }
}
