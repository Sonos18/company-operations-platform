import {createHash} from 'node:crypto'
import {z} from 'zod'
import {costExtractionResultSchema,type CostExtractionAdapter,type CostExtractionInput,type ExtractionResult} from '../../../../shared/schemas/costs/cost-extraction'
import {workflowMoneySchema} from '../../../../shared/schemas/costs/cost-workflow'
import {OfflineCostExtractionAdapter} from './cost-extraction-adapter'
const apiVersion='2024-11-30'
const approvedResourceHost='taskovia-doc-intelligence-dev.cognitiveservices.azure.com'

type Model='prebuilt-invoice'|'prebuilt-layout'
type Warning=ExtractionResult['warnings'][number]
export interface AzureF0Job{key:string;state:'reserved'|'sending'|'submitted'|'uncertain'|'complete';operationUrl?:string;pollAfter?:number;result?:ExtractionResult;raw?:unknown}
/** Required persistent implementation: atomically reserve per RESOURCE/month, never per company.
 * Same key reuses its original reservation; uncertain sends retain pages. claimSend is CAS
 * before POST. One resource dispatch lease serializes POST and GET until settled, with >=3s cooldown and
 * <=20 calls/minute (the portal limit is stricter than the published 1 TPS).
 * Results/operation URLs are private, immutable and guarded by original-file role/scope.
 * This port is not an in-memory quota implementation or an activation permission.
 */
export interface AzureF0DispatchLease{token:string;resourceId:string;kind:'post'|'get';issuedAt:number;expiresAt:number}
export type AzureF0DispatchOutcome='settled'|'unused'|'uncertain'
/** No automatic expiry/regrant: an old worker may still be paused or its HTTP outcome unknown. */
export interface AzureF0JobStore{
 durability:'persistent'
 reserve(input:{key:string;resourceId:string;month:string;pages:number;limit:number;scope:CostExtractionInput['scope'];fileId:string;sha256:string;model:Model;configurationVersion:string}):Promise<{job:AzureF0Job}|{blocked:'quota'|'busy'}>
 claimSend(key:string):Promise<boolean>
 acquireDispatch(resourceId:string,kind:'post'|'get'):Promise<AzureF0DispatchLease|null>
 releaseDispatch(lease:AzureF0DispatchLease,outcome:AzureF0DispatchOutcome):Promise<void>
 saveOperation(key:string,url:string,pollAfter:number):Promise<void>
 markUncertain(key:string):Promise<void>
 complete(key:string,raw:unknown,result:ExtractionResult):Promise<void>
}
export interface AzureF0Transport{
 post(model:Model,bytes:Uint8Array,pages:number,lease:AzureF0DispatchLease):Promise<{status:number;operationUrl?:string;retryAfterSeconds?:number}>
 poll(url:string,lease:AzureF0DispatchLease):Promise<{status:number;body:unknown;retryAfterSeconds?:number}>
}
export interface DocumentInspection{sha256:string;complete:boolean;pageCount:number;nativeResult?:ExtractionResult}
export interface AzureF0Options{
 config:unknown;store:AzureF0JobStore;transport:AzureF0Transport
 inspect(input:CostExtractionInput):Promise<DocumentInspection>
 /** Fresh actor, company, project, immutable file and request revision; no client flag. */
 authorize(input:CostExtractionInput):Promise<boolean>
 now?:()=>number
}
const configSchema=z.object({enabled:z.literal(true),sku:z.literal('F0'),transmissionApproved:z.literal(true),resourceId:z.literal(approvedResourceHost),endpoint:z.string(),version:z.string().min(1).max(100),monthlyPageBudget:z.number().int().min(1).max(500)}).strict()
/** Exact user-approved resource; no arbitrary Azure host or decorated URL. */
export function azureF0Endpoint(value:string){
 try{
  const url=new URL(value)
  if(url.protocol!=='https:'||url.hostname!==approvedResourceHost||url.port||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error()
  return url.origin
 }catch{throw new Error('AZURE_ENDPOINT_INVALID')}
}
function operation(value:string,origin:string,model?:Model){
 const url=new URL(value)
 if(url.origin!==origin||url.username||url.password||url.hash||url.searchParams.size!==1||url.searchParams.get('api-version')!==apiVersion)throw new Error('AZURE_OPERATION_INVALID')
 const match=url.pathname.match(/^\/documentintelligence\/documentModels\/(prebuilt-invoice|prebuilt-layout)\/analyzeResults\/([0-9a-f-]{36})$/)
 if(!match||!z.string().uuid().safeParse(match[2]).success||(model&&match[1]!==model))throw new Error('AZURE_OPERATION_INVALID')
 return url.href
}
function manual(code:Warning):ExtractionResult{return {status:'unavailable',reviewRequired:true,fields:{},warnings:[code],sourceLocations:[],methodVersion:'azure-f0-v1'}}
const region=z.object({pageNumber:z.number().int().min(1).max(2),polygon:z.array(z.number().finite().nonnegative()).min(8).max(32).refine(p=>p.length%2===0)}).passthrough()
const field=z.object({content:z.string().max(2000).optional(),confidence:z.number().finite().min(0).max(1).optional(),boundingRegions:z.array(region).max(100).optional()}).passthrough()
const completed=z.object({status:z.literal('succeeded'),analyzeResult:z.object({apiVersion:z.literal(apiVersion),modelId:z.enum(['prebuilt-invoice','prebuilt-layout']),pages:z.array(z.object({pageNumber:z.number().int().min(1).max(2)}).passthrough()).min(1).max(2),documents:z.array(z.object({fields:z.record(z.string(),z.unknown()).optional()}).passthrough()).max(100).optional()}).passthrough()}).passthrough()
function mapped(raw:unknown,model:Model,pages:number):ExtractionResult{
 const parsed=completed.safeParse(raw)
 if(!parsed.success||parsed.data.analyzeResult.modelId!==model)return manual('EXTRACTION_RESULT_INVALID')
 const numbers=parsed.data.analyzeResult.pages.map(p=>p.pageNumber).sort()
 if(numbers.length!==pages||numbers.some((p,i)=>p!==i+1))return manual('OCR_COVERAGE_UNVERIFIED')
 const result:ExtractionResult={status:'needs_review',reviewRequired:true,fields:{},warnings:['PARTY_MATCH_REQUIRES_REVIEW','TOTAL_REQUIRES_REVIEW'],sourceLocations:[],providerLocations:[],methodVersion:'azure-f0-v1'}
 // Multiple invoice identities and layout text never silently merge into one cost.
 const documents=parsed.data.analyzeResult.documents
 if(model==='prebuilt-invoice'&&documents?.length===1){
  for(const [name,unknown] of Object.entries(documents[0]!.fields??{})){
   const f=field.safeParse(unknown);if(!f.success)continue
   if(name==='InvoiceTotal'&&f.data.content){
    const money=workflowMoneySchema.safeParse(f.data.content.trim())
    if(money.success)result.fields.amount=money.data
    else result.warnings.push('NUMBER_FORMAT_REQUIRES_REVIEW')
   }
   if(name==='VendorName'&&f.data.content?.trim())result.fields.partyHint=f.data.content.trim()
   for(const r of f.data.boundingRegions??[]){
    if(r.pageNumber>pages)continue
    result.providerLocations!.push({field:name,pageNumber:r.pageNumber,polygon:r.polygon,...(f.data.confidence===undefined?{}:{confidence:f.data.confidence})})
   }
  }
 }
 const validated=costExtractionResultSchema.safeParse(result)
 return validated.success?validated.data:manual('EXTRACTION_RESULT_INVALID')
}
/** Prepared, unwired provider adapter. Production requires an approved persistent store,
 * trusted complete native inspection, resource configuration and transmission approval.
 * No runtime environment variables, resource creation, SDK install or S0 fallback.
 */
export class AzureF0CostExtractionAdapter implements CostExtractionAdapter{
 private readonly offline=new OfflineCostExtractionAdapter()
 constructor(private readonly options:AzureF0Options){}
 async extract(input:CostExtractionInput):Promise<ExtractionResult>{
  if(input.mimeType.includes('spreadsheet')||input.mimeType==='application/vnd.ms-excel')return this.offline.extract(input)
  if(input.bytes.byteLength>4_000_000)return manual('EXTRACTION_FILE_TOO_LARGE')
  try{
   if(!await this.options.authorize(input))return manual('OCR_SCOPE_CHANGED')
   const sha256=createHash('sha256').update(input.bytes).digest('hex')
   const inspection=await this.options.inspect(input)
   if(!inspection.complete||inspection.sha256!==sha256||!Number.isInteger(inspection.pageCount)||inspection.pageCount<1)return manual('OCR_COVERAGE_UNVERIFIED')
   if(inspection.nativeResult){
    if(!await this.options.authorize(input))return manual('OCR_SCOPE_CHANGED')
    return costExtractionResultSchema.parse(inspection.nativeResult)
   }
   const parsed=configSchema.safeParse(this.options.config)
   if(!parsed.success||this.options.store.durability!=='persistent')return manual('OCR_PROVIDER_NOT_CONFIGURED')
   const config=parsed.data,origin=azureF0Endpoint(config.endpoint),now=this.options.now??Date.now
   if(inspection.pageCount>2)return manual('OCR_FREE_PAGE_LIMIT')
   if(!['application/pdf','image/png','image/jpeg'].includes(input.mimeType))return manual('OCR_FORMAT_UNSUPPORTED')
   if(!await this.options.authorize(input))return manual('OCR_SCOPE_CHANGED')
   const model:Model=input.documentKind==='invoice'?'prebuilt-invoice':'prebuilt-layout'
   const key=createHash('sha256').update(JSON.stringify([config.resourceId,config.version,input.scope.companyId,input.scope.projectId,input.fileId,sha256,model])).digest('hex')
   const reservation=await this.options.store.reserve({key,resourceId:config.resourceId,configurationVersion:config.version,month:new Date(now()).toISOString().slice(0,7),pages:inspection.pageCount,limit:config.monthlyPageBudget,scope:input.scope,fileId:input.fileId,sha256,model})
   if('blocked' in reservation)return manual(reservation.blocked==='quota'?'OCR_FREE_QUOTA_EXHAUSTED':'OCR_PENDING')
   const job=reservation.job
   if(job.key!==key)return manual('EXTRACTION_RESULT_INVALID')
   if(job.state==='complete'){
    if(!await this.options.authorize(input))return manual('OCR_SCOPE_CHANGED')
    return costExtractionResultSchema.parse(job.result)
   }
   if(job.state==='sending'||job.state==='uncertain')return manual('OCR_RESPONSE_UNCERTAIN')
   if(job.state==='reserved'){
    const lease=await this.options.store.acquireDispatch(config.resourceId,'post')
    if(!lease)return manual('OCR_RATE_LIMITED')
    let outcome:AzureF0DispatchOutcome='unused'
    try{
     if(!await this.options.authorize(input))return manual('OCR_SCOPE_CHANGED')
     if(!await this.options.store.claimSend(key))return manual('OCR_PENDING')
     // A revoked/expired scope after CAS retains the conservative sending reservation.
     if(!await this.options.authorize(input))return manual('OCR_SCOPE_CHANGED')
     if(!dispatchCurrent(lease,'post',now()))return manual('OCR_RATE_LIMITED')
     try{
      outcome='uncertain'
      const response=await this.options.transport.post(model,input.bytes,inspection.pageCount,lease)
      outcome='settled'
      if(response.status!==202||!response.operationUrl)throw new Error('AZURE_SEND_UNCERTAIN')
      const url=operation(response.operationUrl,origin,model)
      const delay=Math.max(2,response.retryAfterSeconds??2)
      await this.options.store.saveOperation(key,url,now()+delay*1000)
     }catch(error){
      if(error instanceof AzureDispatchNotStartedError)outcome='unused'
      try{await this.options.store.markUncertain(key)}catch{/* sending remains durable: never re-POST */}
      return manual('OCR_RESPONSE_UNCERTAIN')
     }
     return manual('OCR_PENDING')
    }finally{
     try{await this.options.store.releaseDispatch(lease,outcome)}catch{/* Unreleased resource lease stays blocked; no expiry/regrant. */}
    }
   }
   if(!job.operationUrl)return manual('EXTRACTION_RESULT_INVALID')
   const url=operation(job.operationUrl,origin,model)
   if(job.pollAfter===undefined||now()<job.pollAfter)return manual('OCR_PENDING')
   const lease=await this.options.store.acquireDispatch(config.resourceId,'get')
   if(!lease)return manual('OCR_RATE_LIMITED')
   let outcome:AzureF0DispatchOutcome='unused'
   let response:Awaited<ReturnType<AzureF0Transport['poll']>>
   try{
   if(!await this.options.authorize(input))return manual('OCR_SCOPE_CHANGED')
   if(!dispatchCurrent(lease,'get',now()))return manual('OCR_RATE_LIMITED')
   try{outcome='uncertain';response=await this.options.transport.poll(url,lease);outcome='settled'}catch(error){
    if(error instanceof AzureDispatchNotStartedError)outcome='unused'
    await this.options.store.saveOperation(key,url,now()+5000)
    return manual('OCR_PENDING')
   }
   }finally{
    try{await this.options.store.releaseDispatch(lease,outcome)}catch{/* Unknown lease remains held; operator reconciliation required. */}
   }
   if(response.status===429||response.status>=500){
    const delay=Math.max(2,response.retryAfterSeconds??5)
    await this.options.store.saveOperation(key,url,now()+delay*1000)
    return manual('OCR_RATE_LIMITED')
   }
   if(response.status!==200)return manual('EXTRACTION_RESULT_INVALID')
   const status=z.object({status:z.string()}).passthrough().safeParse(response.body)
   if(status.success&&['running','notStarted'].includes(status.data.status)){
    await this.options.store.saveOperation(key,url,now()+Math.max(2,response.retryAfterSeconds??2)*1000);return manual('OCR_PENDING')
   }
   const result=mapped(response.body,model,inspection.pageCount)
   if(!await this.options.authorize(input))return manual('OCR_SCOPE_CHANGED')
   // Retain the bounded provider response before exposing any hints; never log its contents.
   await this.options.store.complete(key,response.body,result)
   if(!await this.options.authorize(input))return manual('OCR_SCOPE_CHANGED')
   return result
  }catch{return manual('EXTRACTION_RESULT_INVALID')}
 }
}
class AzureDispatchNotStartedError extends Error{constructor(){super('AZURE_DISPATCH_NOT_STARTED')}}
function dispatchCurrent(value:AzureF0DispatchLease,kind:'post'|'get',now:number):boolean{
 return !!value&&value.resourceId===approvedResourceHost&&value.kind===kind&&z.string().uuid().safeParse(value.token).success
  &&Number.isSafeInteger(value.issuedAt)&&value.issuedAt>=0&&Number.isSafeInteger(value.expiresAt)
  &&value.expiresAt-value.issuedAt===20000&&value.expiresAt<=8_640_000_000_000_000&&Number.isSafeInteger(now)&&value.issuedAt<=now&&now<value.expiresAt
  &&(kind!=='post'||new Date(value.issuedAt).toISOString().slice(0,7)===new Date(now).toISOString().slice(0,7))
}
async function boundedJson(response:Response,signal:AbortSignal){
 if(Number(response.headers.get('content-length'))>4_000_000)throw new Error('AZURE_RESULT_TOO_LARGE')
 const reader=response.body?.getReader();if(!reader)throw new Error('AZURE_RESULT_INVALID')
 const chunks:Uint8Array[]=[];let size=0
 const aborted=()=>{void reader.cancel().catch(()=>{})}
 if(signal.aborted){await reader.cancel().catch(()=>{});throw new Error('AZURE_DISPATCH_TIMEOUT')}
 signal.addEventListener('abort',aborted,{once:true})
 try{for(;;){const value=await reader.read();if(value.done)break;size+=value.value.byteLength;if(size>4_000_000)throw new Error('AZURE_RESULT_TOO_LARGE');chunks.push(value.value)}}
 catch(error){await reader.cancel().catch(()=>{});throw error}
 finally{signal.removeEventListener('abort',aborted);reader.releaseLock()}
 if(signal.aborted)throw new Error('AZURE_DISPATCH_TIMEOUT')
 return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
export class AzureDocumentIntelligenceTransport implements AzureF0Transport{
 private readonly origin:string
 constructor(resourceEndpoint:string,private readonly credential:()=>string,private readonly fetcher:typeof fetch=fetch){this.origin=azureF0Endpoint(resourceEndpoint)}
 private async request<T>(url:string,init:RequestInit,lease:AzureF0DispatchLease,consume:(response:Response,signal:AbortSignal)=>Promise<T>):Promise<T>{
  const kind=init.method==='POST'?'post':'get'
  if(!dispatchCurrent(lease,kind,Date.now()))throw new AzureDispatchNotStartedError()
  const remaining=lease.expiresAt-Date.now(),deadline=performance.now()+remaining
  const controller=new AbortController()
  const headers={...init.headers,'Ocp-Apim-Subscription-Key':this.credential()}
  // No awaited authorization, RPC, credential or body preparation between this check and fetch.
  if(!dispatchCurrent(lease,kind,Date.now())||performance.now()>=deadline)throw new AzureDispatchNotStartedError()
  let timer:ReturnType<typeof setTimeout>|undefined
  const timedOut=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('AZURE_DISPATCH_TIMEOUT'))},Math.min(15000,remaining))})
  try{
   const response=this.fetcher(url,{...init,redirect:'error',signal:controller.signal,headers})
   return await Promise.race([response.then(value=>consume(value,controller.signal)),timedOut])
  }finally{if(timer!==undefined)clearTimeout(timer)}
 }
 async post(model:Model,bytes:Uint8Array,pages:number,lease:AzureF0DispatchLease){
  if(!Number.isInteger(pages)||pages<1||pages>2||bytes.byteLength===0||bytes.byteLength>4_000_000)throw new Error('AZURE_F0_LIMIT')
  const url=new URL(this.origin+'/documentintelligence/documentModels/'+model+':analyze')
  url.searchParams.set('_overload','analyzeDocument');url.searchParams.set('api-version',apiVersion);url.searchParams.set('pages',pages===1?'1':'1-2');url.searchParams.set('stringIndexType','unicodeCodePoint')
  return this.request(url.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base64Source:Buffer.from(bytes).toString('base64')})},lease,async response=>{
   const result={status:response.status,operationUrl:response.headers.get('operation-location')??undefined,retryAfterSeconds:retryAfter(response)}
   await response.body?.cancel()
   return result
  })
 }
 async poll(url:string,lease:AzureF0DispatchLease){
  return this.request(operation(url,this.origin),{method:'GET'},lease,async(response,signal)=>{
   const body=response.status===200?await boundedJson(response,signal):null
   if(response.status!==200)await response.body?.cancel()
   return {status:response.status,body,retryAfterSeconds:retryAfter(response)}
  })
 }
}
function retryAfter(response:Response){
 const raw=response.headers.get('retry-after')
 if(!raw)return undefined
 const seconds=/^\d+$/.test(raw)?Number(raw):Math.max(0,Math.ceil((Date.parse(raw)-Date.now())/1000))
 if(!Number.isFinite(seconds))return undefined
 if(!Number.isSafeInteger(seconds)||seconds>(Number.MAX_SAFE_INTEGER-Date.now())/1000)throw new Error('AZURE_RETRY_INVALID')
 return seconds
}
