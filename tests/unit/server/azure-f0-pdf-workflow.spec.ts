import {createHash} from 'node:crypto'
import {expect,it,vi} from 'vitest'
import * as azure from '../../../server/features/costs/extraction/azure-f0-cost-extraction'
import type {AzureF0Job,AzureF0JobStore,AzureF0Transport,AzureF0Options} from '../../../server/features/costs/extraction/azure-f0-cost-extraction'
import type {AzureF0PdfInput,AzureF0PdfAdmissionContext,AzureF0PdfExtractionResult} from '../../../server/features/costs/extraction/azure-f0-pdf-admission'
const factory=azure.createAzureF0PdfAdmission
const id='11111111-1111-4111-8111-111111111111',host='taskovia-doc-intelligence-dev.cognitiveservices.azure.com'
function fixture(scope:'1'|'1-2'='1-2'){
 const bytes=Buffer.from('%PDF-1.7\nsynthetic scoped PDF; never a real document\n%%EOF\n'),sha256=createHash('sha256').update(bytes).digest('hex')
 const metadata={tenantId:id,companyId:id,projectId:id,fileId:id,fileVersion:2,sha256,mimeType:'application/pdf',sizeBytes:bytes.length}
 const input:AzureF0PdfInput={fileId:id,mimeType:'application/pdf',bytes,scope:{companyId:id,projectId:id},documentKind:'invoice',pdfPageScope:scope}
 let now=Date.UTC(2026,9,6),job:AzureF0Job|undefined
 let context:AzureF0PdfAdmissionContext={metadata,pdfPageScope:scope,sourcePageCount:{kind:'unknown'}}
 const store:AzureF0JobStore={durability:'persistent',pdfScopeContract:'azure-pdf-scope-v1',
  reserve:vi.fn(async value=>{job??={key:value.key,state:'reserved'};return{job}}),
  claimSend:vi.fn(async()=>{if(job?.state!=='reserved')return false;job.state='sending';return true}),
  acquireDispatch:vi.fn(async(_resource,kind)=>({resourceId:host,kind,token:id,issuedAt:now,expiresAt:now+20000})),
  releaseDispatch:vi.fn(async()=>{}),saveOperation:vi.fn(async(_key,url,pollAfter)=>{job!.state='submitted';job!.operationUrl=url;job!.pollAfter=pollAfter}),
  markUncertain:vi.fn(async()=>{job!.state='uncertain'}),
  complete:vi.fn(async(_key,raw,result)=>{job!.state='complete';job!.raw=raw;job!.result=result})}
 const post=vi.fn<AzureF0Transport['post']>(async model=>({status:202,operationUrl:'https://'+host+'/documentintelligence/documentModels/'+model+'/analyzeResults/'+id+'?api-version=2024-11-30'}))
 const poll=vi.fn<AzureF0Transport['poll']>(async()=>({status:200,body:{status:'succeeded',analyzeResult:{apiVersion:'2024-11-30',modelId:'prebuilt-invoice',pages:(scope==='1'?[1]:[1,2]).map(pageNumber=>({pageNumber})),documents:[{fields:{InvoiceTotal:{content:'9007199254740993.1234',valueNumber:9007199254740992},VendorName:{content:'Nhà cung cấp thử nghiệm'}}}]}}}))
 const inspect=vi.fn(async()=>({sha256,complete:false,pageCount:0})),authorize=vi.fn(async()=>true)
 const admitPdf=vi.fn(async (value:AzureF0PdfInput)=>{expect(factory).toBeTypeOf('function');return factory(metadata,async()=>context)(value)})
 const options:AzureF0Options={config:{enabled:true,sku:'F0',transmissionApproved:true,resourceId:host,endpoint:'https://'+host,version:'synthetic-v1',monthlyPageBudget:500},store,transport:{post,poll},inspect,authorize,admitPdf,now:()=>now}
 const adapter=new azure.AzureF0CostExtractionAdapter(options)
 return{input,options,store,post,poll,inspect,authorize,admitPdf,adapter,job:()=>job,next:()=>{now+=3000},context:(value:AzureF0PdfAdmissionContext)=>{context=value},metadata,sha256}
}
it.each(['1','1-2'] as const)('runs explicit scope %s through POST, poll and cache with honest coverage and exact money',async scope=>{
 const f=fixture(scope),network=vi.spyOn(globalThis,'fetch')
 try{
  expect((await f.adapter.extract(f.input)).warnings).toContain('OCR_PENDING')
  f.next();const result=await f.adapter.extract(f.input)
  expect(result).toMatchObject({status:'needs_review',reviewRequired:true,fields:{amount:'9007199254740993.1234',partyHint:'Nhà cung cấp thử nghiệm'},azurePdfCoverage:{kind:'azure-pdf-scope-v1',sourceSha256:f.sha256,requestedPages:scope==='1'?[1]:[1,2],returnedPages:scope==='1'?[1]:[1,2],requestedPagesMatched:true,sourcePageCount:{kind:'unknown'},wholeDocumentComplete:false,reviewRequired:true}})
  expect(await f.adapter.extract(f.input)).toEqual(result)
  expect(f.inspect).not.toHaveBeenCalled();expect(f.post).toHaveBeenCalledTimes(1);expect(f.poll).toHaveBeenCalledTimes(1)
  expect(f.post.mock.calls[0]?.[2]).toBe(scope==='1'?1:2)
  expect(vi.mocked(f.store.reserve).mock.calls[0]?.[0]).toMatchObject({pages:scope==='1'?1:2,pdfPageScope:scope})
  expect(network).not.toHaveBeenCalled()
 }finally{network.mockRestore()}
})
it('does not activate PDF with the old persistent store or missing admission port',async()=>{
 for(const mode of ['store','admission'] as const){
  const f=fixture();if(mode==='store')delete f.store.pdfScopeContract;else delete f.options.admitPdf
  expect((await f.adapter.extract(f.input)).status).toBe('unavailable')
  expect(f.store.reserve).not.toHaveBeenCalled();expect(f.post).not.toHaveBeenCalled()
 }
})
it('denies absent explicit scope even if a caller supplies a complete provider inspection',async()=>{
 const f=fixture();delete f.input.pdfPageScope;f.inspect.mockResolvedValue({sha256:f.sha256,complete:true,pageCount:2})
 expect((await f.adapter.extract(f.input)).warnings).toContain('OCR_COVERAGE_UNVERIFIED')
 expect(f.store.reserve).not.toHaveBeenCalled();expect(f.post).not.toHaveBeenCalled()
})
it('denies failed or wrong-byte admission before any quota/provider call',async()=>{
 for(const mode of ['denied','hash'] as const){
  const f=fixture()
  if(mode==='denied')f.admitPdf.mockResolvedValue(null)
  else f.admitPdf.mockImplementation(async()=>({kind:'azure-pdf-scope-v1',admitted:true,sourceSha256:'0'.repeat(64),sourceByteLength:f.input.bytes.length,mimeType:'application/pdf',scope:'1-2',requestedPages:[1,2],reservedPageUnits:2,sourcePageCount:{kind:'unknown'},wholeDocumentComplete:false}))
  expect((await f.adapter.extract(f.input)).warnings).toContain('OCR_COVERAGE_UNVERIFIED')
  expect(f.store.reserve).not.toHaveBeenCalled();expect(f.post).not.toHaveBeenCalled()
 }
})
it('uses different durable identities for explicit one- and two-page plans',async()=>{
 const a=fixture('1'),b=fixture('1-2');await a.adapter.extract(a.input);await b.adapter.extract(b.input)
 expect(vi.mocked(a.store.reserve).mock.calls[0]?.[0].key).not.toBe(vi.mocked(b.store.reserve).mock.calls[0]?.[0].key)
})
it('keeps a known long source explicitly partial rather than truncating a whole-document claim',async()=>{
 const f=fixture();f.context({metadata:f.metadata,pdfPageScope:'1-2',sourcePageCount:{kind:'user-declared',count:7}})
 await f.adapter.extract(f.input);f.next()
 expect(await f.adapter.extract(f.input)).toMatchObject({status:'needs_review',azurePdfCoverage:{sourcePageCount:{kind:'user-declared',count:7},requestedPages:[1,2],wholeDocumentComplete:false}})
})
it.each([[1],[1,1],[1,2,2],[1,3],[],['1',2]].map(pages=>[pages]))('refuses incomplete, duplicate, extra or invalid provider pages %j without a second POST',async pages=>{
 const f=fixture();await f.adapter.extract(f.input);f.next()
 f.poll.mockResolvedValue({status:200,body:{status:'succeeded',analyzeResult:{apiVersion:'2024-11-30',modelId:'prebuilt-invoice',pages:pages.map(pageNumber=>({pageNumber})),documents:[{fields:{InvoiceTotal:{content:'123'}}}]}}})
 const result=await f.adapter.extract(f.input) as AzureF0PdfExtractionResult
 expect(result.status).toBe('unavailable');expect(result.fields).toEqual({});expect(result.azurePdfCoverage.requestedPagesMatched).toBe(false);expect(result.azurePdfCoverage.wholeDocumentComplete).toBe(false)
 await f.adapter.extract(f.input);expect(f.post).toHaveBeenCalledTimes(1)
})
it.each([{status:'failed',error:{code:'InvalidContent'}},{status:'succeeded',analyzeResult:{apiVersion:'old',modelId:'prebuilt-invoice',pages:[{pageNumber:1},{pageNumber:2}]}},{status:'succeeded',analyzeResult:{apiVersion:'2024-11-30',modelId:'prebuilt-layout',pages:[{pageNumber:1},{pageNumber:2}]}}])('refuses invalid provider completion %j',async body=>{
 const f=fixture();await f.adapter.extract(f.input);f.next();f.poll.mockResolvedValue({status:200,body})
 expect(await f.adapter.extract(f.input)).toMatchObject({status:'unavailable',fields:{},azurePdfCoverage:{wholeDocumentComplete:false,reviewRequired:true}})
})
it('holds provider warnings for review instead of exposing financial hints as unqualified output',async()=>{
 const f=fixture();await f.adapter.extract(f.input);f.next()
 const response=await f.poll('',{} as never);(response.body as {analyzeResult:{warnings:unknown}}).analyzeResult.warnings=[{code:'SyntheticWarning',message:'synthetic only'}];f.poll.mockClear();f.poll.mockResolvedValue(response)
 expect(await f.adapter.extract(f.input)).toMatchObject({status:'unavailable',fields:{},azurePdfCoverage:{requestedPagesMatched:true,wholeDocumentComplete:false}})
})
it.each(['missing','hash','scope','whole','pageCount'] as const)('rejects cached coverage that is %s and never falls back to a new POST',async change=>{
 const f=fixture();await f.adapter.extract(f.input);f.next();await f.adapter.extract(f.input)
 const result=f.job()!.result as AzureF0PdfExtractionResult
 if(change==='missing')delete (result as Partial<AzureF0PdfExtractionResult>).azurePdfCoverage
 else if(change==='hash')result.azurePdfCoverage={...result.azurePdfCoverage,sourceSha256:'0'.repeat(64)}
 else if(change==='scope')result.azurePdfCoverage={...result.azurePdfCoverage,requestedPages:[1],returnedPages:[1]}
 else if(change==='whole')result.azurePdfCoverage={...result.azurePdfCoverage,wholeDocumentComplete:true} as never
 else result.azurePdfCoverage={...result.azurePdfCoverage,sourcePageCount:{kind:'user-declared',count:9}}
 const output=await f.adapter.extract(f.input)
 expect(output.status).toBe('unavailable');expect(output.fields).toEqual({});expect(f.post).toHaveBeenCalledTimes(1)
})
it('pins bytes, scope and MIME before an asynchronous private port yields',async()=>{
 const f=fixture();f.authorize.mockImplementation(async()=>{f.input.bytes.fill(0);f.input.pdfPageScope='1';f.input.mimeType='image/png';return true})
 await f.adapter.extract(f.input)
 expect(f.post.mock.calls[0]?.[1]).toEqual(Uint8Array.from(Buffer.from('%PDF-1.7\nsynthetic scoped PDF; never a real document\n%%EOF\n')))
 expect(f.post.mock.calls[0]?.[2]).toBe(2)
})
it('keeps fresh authorization before admission, dispatch and cached result exposure',async()=>{
 const f=fixture();f.authorize.mockResolvedValue(false)
 expect((await f.adapter.extract(f.input)).warnings).toContain('OCR_SCOPE_CHANGED');expect(f.admitPdf).not.toHaveBeenCalled();expect(f.post).not.toHaveBeenCalled()
 const g=fixture();await g.adapter.extract(g.input);g.next();await g.adapter.extract(g.input);g.authorize.mockResolvedValue(false)
 expect((await g.adapter.extract(g.input)).warnings).toContain('OCR_SCOPE_CHANGED');expect(g.post).toHaveBeenCalledTimes(1);expect(g.poll).toHaveBeenCalledTimes(1)
})
it('rechecks authorization after asynchronous private result persistence',async()=>{
 const f=fixture();await f.adapter.extract(f.input);f.next()
 vi.mocked(f.store.complete).mockImplementation(async()=>{f.authorize.mockResolvedValue(false)})
 expect(await f.adapter.extract(f.input)).toMatchObject({status:'unavailable',fields:{},warnings:['OCR_SCOPE_CHANGED'],azurePdfCoverage:{wholeDocumentComplete:false}})
})
it('never resends an uncertain scoped PDF',async()=>{
 const f=fixture();f.post.mockRejectedValue(Error('synthetic timeout'))
 expect((await f.adapter.extract(f.input)).warnings).toContain('OCR_RESPONSE_UNCERTAIN')
 expect((await f.adapter.extract(f.input)).warnings).toContain('OCR_RESPONSE_UNCERTAIN')
 expect(f.post).toHaveBeenCalledTimes(1)
})
