import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {deflateSync} from 'node:zlib'
import {expect,it,vi} from 'vitest'
import {AzureF0CostExtractionAdapter,type AzureF0Job,type AzureF0JobStore,type AzureF0Transport} from '../../../server/features/costs/extraction/azure-f0-cost-extraction'
import {createAzureF0ImageDocumentInspector} from '../../../server/features/costs/extraction/azure-f0-document-inspection'
import {createAzureF0RequestAuthorizer,type AzureF0RequestAccess} from '../../../server/features/costs/extraction/azure-f0-authorization'
import {CostExtractionService,type CostExtractionRepository} from '../../../server/features/costs/extraction/cost-extraction.service'
import {costExtractionResultSchema,costExtractionViewSchema,type ExtractionResult} from '../../../shared/schemas/costs/cost-extraction'
const require=createRequire(import.meta.url)
let available=false
try{available=require('pngjs/package.json').version==='7.0.0'}catch{/* Deployment dependencies are separately approved. */}
const imageTest=it.runIf(available)
const id='11111111-1111-4111-8111-111111111111',host='taskovia-doc-intelligence-dev.cognitiveservices.azure.com'
function crc(b:Uint8Array){let c=0xffffffff;for(const x of b){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function chunk(type:string,data:Buffer){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,data.length+8)),data.length+8);return b}
function png(){
 const header=Buffer.alloc(13);header.writeUInt32BE(64);header.writeUInt32BE(64,4);header[8]=8;header[9]=6
 const rows=Buffer.alloc(64*257,128);for(let y=0;y<64;y++)rows[y*257]=0
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])
}
function fixture(kind='invoice'){
 const bytes=png(),sha256=createHash('sha256').update(bytes).digest('hex')
 const access:AzureF0RequestAccess={actorId:id,tenantId:id,companyId:id,projectId:id,fileId:id,fileVersion:1,requestId:id,requestVersion:3,sha256,mimeType:'image/png',sizeBytes:bytes.length,permissions:['cost.prepare','cost.request.submit','cost.request.file.read','cost.request.read']}
 let fresh={...access},now=Date.UTC(2026,9,6),job:AzureF0Job|undefined,recorded:ExtractionResult|undefined
 const readAccess=async()=>({...fresh})
 // Test-only fake durable port: no database or production persistence is used.
 const store:AzureF0JobStore={
  durability:'persistent',reserve:async value=>{job??={key:value.key,state:'reserved'};return {job}},
  claimSend:async()=>{if(job?.state!=='reserved')return false;job.state='sending';return true},
  acquireDispatch:async(_resource,dispatchKind)=>({token:id,resourceId:host,kind:dispatchKind,issuedAt:now,expiresAt:now+20000}),
  releaseDispatch:async()=>{},saveOperation:async(_key,url,pollAfter)=>{job!.state='submitted';job!.operationUrl=url;job!.pollAfter=pollAfter},
  markUncertain:async()=>{job!.state='uncertain'},complete:async(_key,raw,result)=>{job!.state='complete';job!.raw=raw;job!.result=result},
 }
 const model=kind==='invoice'?'prebuilt-invoice':'prebuilt-layout'
 const transport:AzureF0Transport={
  post:vi.fn(async()=>({status:202,operationUrl:'https://'+host+'/documentintelligence/documentModels/'+model+'/analyzeResults/'+id+'?api-version=2024-11-30'})),
  poll:vi.fn(async()=>({status:200,body:{status:'succeeded',analyzeResult:{apiVersion:'2024-11-30',modelId:model,pages:[{pageNumber:1}],documents:[{fields:{VendorName:{content:'Nhà cung cấp tổng hợp'},InvoiceTotal:{content:'9007199254740993.1234',valueCurrency:{amount:9007199254740992,currencyCode:'VND'},confidence:0.82,boundingRegions:[{pageNumber:1,polygon:[0,0,1,0,1,1,0,1]}]}}}]}}})),
 }
 const adapter=new AzureF0CostExtractionAdapter({config:{enabled:true,sku:'F0',transmissionApproved:true,resourceId:host,endpoint:'https://'+host,version:'synthetic-v1',monthlyPageBudget:500},store,transport,authorize:createAzureF0RequestAuthorizer(access,readAccess),inspect:createAzureF0ImageDocumentInspector(access,readAccess),now:()=>now})
 const target={fileId:id,companyId:id,projectId:id,requestId:id,fileVersion:1,requestVersion:3,sha256,mimeType:'image/png',documentKind:kind}
 const repository:CostExtractionRepository={
  readTarget:async()=>target,download:async()=>Uint8Array.from(bytes),
  persist:async(_context,_project,pinned,result)=>{
   if(fresh.requestVersion!==pinned.requestVersion||fresh.actorId!==access.actorId)throw Error('VERSION_CONFLICT')
   recorded=costExtractionResultSchema.parse(result)
   return costExtractionViewSchema.parse({extractionId:id,fileId:id,requestId:id,result:recorded,replayed:false})
  },
 }
 const service=new CostExtractionService(repository,adapter)
 const context={actorId:id,tenantId:id,companyId:id,requestId:id,permissions:access.permissions as never}
 return {service,context,transport,job:()=>job,recorded:()=>recorded,advance:()=>{now+=3000},change:(patch:Partial<AzureF0RequestAccess>)=>{fresh={...fresh,...patch}},extract:()=>service.extract(context,id,id,id,id)}
}
imageTest('runs original inspection through POST/poll/cache into the existing review-only form contract',async()=>{
 const network=vi.spyOn(globalThis,'fetch')
 try{
  const f=fixture()
  expect((await f.extract()).result.warnings).toContain('OCR_PENDING')
  f.advance()
  const completed=await f.extract()
  expect(completed.result).toMatchObject({status:'needs_review',reviewRequired:true,fields:{partyHint:'Nhà cung cấp tổng hợp',amount:'9007199254740993.1234'},methodVersion:'azure-f0-v1'})
  expect(completed.result.providerLocations?.[0]).toMatchObject({field:'InvoiceTotal',pageNumber:1,confidence:0.82})
  expect((await f.extract()).result).toEqual(completed.result)
  expect(f.transport.post).toHaveBeenCalledTimes(1);expect(f.transport.poll).toHaveBeenCalledTimes(1)
  expect(f.recorded()?.fields).not.toHaveProperty('partyId');expect(f.recorded()?.fields).not.toHaveProperty('paidAmount')
  expect(network).not.toHaveBeenCalled()
 }finally{network.mockRestore()}
})
imageTest('denies a stale request revision before returning provider suggestions',async()=>{
 const f=fixture();await f.extract();f.advance();f.change({requestVersion:4})
 await expect(f.extract()).rejects.toThrow('VERSION_CONFLICT')
 expect(f.job()?.state).toBe('submitted');expect(f.transport.poll).not.toHaveBeenCalled()
})
imageTest('denies a revoked actor before exposing a completed cached result',async()=>{
 const f=fixture();await f.extract();f.advance();await f.extract();f.change({actorId:'22222222-2222-4222-8222-222222222222'})
 await expect(f.extract()).rejects.toThrow('VERSION_CONFLICT')
 expect(f.transport.post).toHaveBeenCalledTimes(1);expect(f.transport.poll).toHaveBeenCalledTimes(1)
})
imageTest.each(['quotation','contract'])('keeps %s layout text out of inferred invoice money/party/basis',async kind=>{
 const f=fixture(kind);await f.extract();f.advance();const view=await f.extract()
 expect(view.result.fields).toEqual({});expect(view.result.reviewRequired).toBe(true)
 expect(vi.mocked(f.transport.post).mock.calls[0]?.[0]).toBe('prebuilt-layout')
})
