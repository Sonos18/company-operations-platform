import {createHash} from 'node:crypto'
import {describe,it,expect,vi} from 'vitest'
import {AzureF0CostExtractionAdapter,type AzureF0JobStore} from '../../../server/features/costs/extraction/azure-f0-cost-extraction'
import {createAzureF0JobStore,type AzureF0PrivateRpc} from '../../../server/features/costs/extraction/azure-f0-job-store'
import {azureF0PdfCoverage,type AzureF0PdfAdmission} from '../../../server/features/costs/extraction/azure-f0-pdf-admission'
import {azureF0ReservationKey} from '../../../server/features/costs/extraction/azure-f0-job-identity'
import {createAzureF0RequestAuthorizer} from '../../../server/features/costs/extraction/azure-f0-authorization'

const host='taskovia-doc-intelligence-dev.cognitiveservices.azure.com'
const id='c1f60000-0000-4000-8000-000000000001'
const configurationVersion='azure-f0-rest-2024-11-30-quotation-v2'
const bytes=Buffer.from('%PDF-1.7\nsynthetic retained quotation\n%%EOF\n')
const sha256=createHash('sha256').update(bytes).digest('hex')
const binding={actorId:id,tenantId:id,companyId:id,projectId:id,fileId:id,fileVersion:1,sha256,requestId:id,requestVersion:3}
const input={fileId:id,mimeType:'application/pdf',bytes,scope:{companyId:id,projectId:id},documentKind:'quotation',pdfPageScope:'1-2' as const}
const admission:AzureF0PdfAdmission={kind:'azure-pdf-scope-v1',admitted:true,sourceSha256:sha256,sourceByteLength:bytes.length,mimeType:'application/pdf',scope:'1-2',requestedPages:[1,2],reservedPageUnits:2,sourcePageCount:{kind:'unknown'},wholeDocumentComplete:false}
const reservation={key:'',resourceId:host,configurationVersion,month:'2026-10',pages:2,limit:500,scope:input.scope,fileId:id,sha256,model:'prebuilt-layout' as const,pdfPageScope:'1-2' as const}
reservation.key=azureF0ReservationKey(reservation)
const key=reservation.key
const operationUrl='https://'+host+'/documentintelligence/documentModels/prebuilt-layout/analyzeResults/'+id+'?api-version=2024-11-30'
function rawQuotation(){
 const rows=[['Description','Quantity','Unit','Unit price VND','Line total'],['Synthetic item','1','piece','100','100'],['Subtotal','','','','100'],['VAT 10%','','','','10'],['Grand total','','','','110']]
 let offset=0
 const words:Array<{content:string;confidence:number;span:{offset:number;length:number}}>=[]
 const cells=rows.flatMap((row,rowIndex)=>row.map((content,columnIndex)=>{
  const span={offset,length:Math.max(1,content.length)};offset+=span.length+1
  if(content)words.push({content,confidence:0.99,span})
  return {content,rowIndex,columnIndex,spans:[span],boundingRegions:[{pageNumber:1,polygon:[columnIndex,rowIndex,columnIndex+1,rowIndex,columnIndex+1,rowIndex+1,columnIndex,rowIndex+1]}]}
 }))
 return {status:'succeeded',analyzeResult:{apiVersion:'2024-11-30',modelId:'prebuilt-layout',pages:[{pageNumber:1,words},{pageNumber:2}],tables:[{rowCount:rows.length,columnCount:5,cells}]}}
}
const raw=rawQuotation()
const cached={status:'needs_review' as const,reviewRequired:true as const,fields:{},warnings:[],sourceLocations:[],providerLocations:[],methodVersion:'azure-f0-v1' as const,azurePdfCoverage:azureF0PdfCoverage(admission,raw)}
function adapterFixture(){
 const job={key,state:'complete' as const,operationUrl,pollAfter:1,result:cached}
 const readCompletedRaw=vi.fn(async()=>raw as unknown)
 const store={durability:'persistent' as const,pdfScopeContract:'azure-pdf-scope-v1' as const,reserve:vi.fn<AzureF0JobStore['reserve']>(async()=>({job})),readCompletedRaw,claimSend:vi.fn(),acquireDispatch:vi.fn(),releaseDispatch:vi.fn(),saveOperation:vi.fn(),markUncertain:vi.fn(),complete:vi.fn()}
 const transport={post:vi.fn(),poll:vi.fn()}
 const authorize=vi.fn(async()=>true)
 const options={config:{enabled:true,sku:'F0',transmissionApproved:true,resourceId:host,endpoint:'https://'+host,version:configurationVersion,monthlyPageBudget:500},store:store as AzureF0JobStore,transport,authorize,admitPdf:vi.fn(async()=>admission),inspect:vi.fn(),now:()=>Date.UTC(2026,9,7)}
 return {job,store,transport,authorize,options,adapter:new AzureF0CostExtractionAdapter(options)}
}
function noProviderOrMutation(f:ReturnType<typeof adapterFixture>){
 expect(f.store.reserve).toHaveBeenCalledTimes(1)
 expect(f.transport.post).not.toHaveBeenCalled();expect(f.transport.poll).not.toHaveBeenCalled()
 expect(f.store.claimSend).not.toHaveBeenCalled();expect(f.store.acquireDispatch).not.toHaveBeenCalled();expect(f.store.complete).not.toHaveBeenCalled()
 expect(f.store.saveOperation).not.toHaveBeenCalled();expect(f.store.markUncertain).not.toHaveBeenCalled()
}
describe('completed quotation retains provider identity and remaps private evidence',()=>{
 it('derives fresh mapped hints with the original scope without changing the completed job',async()=>{
  const f=adapterFixture(),before=JSON.stringify(f.job)
  const result=await f.adapter.extract(input)
  expect(result.fields).toMatchObject({amount:'110',currencyCode:'VND',basis:{kind:'materials',lines:[{description:'Synthetic item',quantity:'1',unit:'piece',unitPrice:'100'}]}})
  expect(result.azurePdfCoverage).toEqual(cached.azurePdfCoverage)
  expect(result.providerLocations?.length).toBeGreaterThan(0)
  expect(f.store.readCompletedRaw).toHaveBeenCalledWith(key)
  expect(f.store.reserve.mock.calls[0]?.[0]).toEqual(reservation)
  expect(JSON.stringify(f.job)).toBe(before);noProviderOrMutation(f)
  expect(result).not.toHaveProperty('raw');expect(result).not.toHaveProperty('analyzeResult')
 })
 it.each(['missing','denied','invalid','oversized'] as const)('fails closed for %s raw evidence without another reservation or provider action',async kind=>{
  const f=adapterFixture()
  if(kind==='denied')f.store.readCompletedRaw.mockRejectedValue(Error('private payload'))
  else f.store.readCompletedRaw.mockResolvedValue(kind==='missing'?null:kind==='oversized'?{...raw,content:'x'.repeat(4_000_001)}:{...raw,status:'failed'})
  const result=await f.adapter.extract(input)
  expect(result).toMatchObject({status:'unavailable',fields:{},warnings:['EXTRACTION_RESULT_INVALID']});noProviderOrMutation(f)
 })
 it('hides retained hints when fresh authorization changes while reading',async()=>{
  const f=adapterFixture();f.store.readCompletedRaw.mockImplementation(async()=>{f.authorize.mockResolvedValue(false);return raw})
  expect(await f.adapter.extract(input)).toMatchObject({status:'unavailable',fields:{},warnings:['OCR_SCOPE_CHANGED']});noProviderOrMutation(f)
 })
 it.each(['missing','mismatch','unmatched'] as const)('blocks %s cached coverage before reading raw',async kind=>{
  const f=adapterFixture()
  f.job.result={...cached,...(kind==='missing'?{azurePdfCoverage:undefined}:kind==='mismatch'?{azurePdfCoverage:{...cached.azurePdfCoverage,sourceSha256:'a'.repeat(64)}}:{status:'unavailable',azurePdfCoverage:{...cached.azurePdfCoverage,returnedPages:[],requestedPagesMatched:false}})} as never
  expect((await f.adapter.extract(input)).warnings).toContain('OCR_COVERAGE_UNVERIFIED')
  expect(f.store.readCompletedRaw).not.toHaveBeenCalled();noProviderOrMutation(f)
 })
 it('keeps non-quotation completed layout results on the existing validated cache path',async()=>{
  const f=adapterFixture()
  expect(await f.adapter.extract({...input,documentKind:'contract'})).toEqual(cached)
  expect(f.store.readCompletedRaw).not.toHaveBeenCalled();noProviderOrMutation(f)
 })
 it('keeps completed invoices on the validated cached result path without reading raw',async()=>{
  const f=adapterFixture(),invoiceKey=azureF0ReservationKey({...reservation,model:'prebuilt-invoice'})
  f.job.key=invoiceKey
  expect(await f.adapter.extract({...input,documentKind:'invoice'})).toEqual(cached)
  expect(f.store.readCompletedRaw).not.toHaveBeenCalled();noProviderOrMutation(f)
 })
 it('fails closed when the completed-raw capability is unavailable',async()=>{
  const f=adapterFixture();f.options.store.readCompletedRaw=undefined
  expect(await f.adapter.extract(input)).toMatchObject({status:'unavailable',fields:{},warnings:['EXTRACTION_RESULT_INVALID']});noProviderOrMutation(f)
 })
 it('rejects provider page coverage that differs from the retained scope',async()=>{
  const f=adapterFixture();f.store.readCompletedRaw.mockResolvedValue({...raw,analyzeResult:{...raw.analyzeResult,pages:[{pageNumber:1}]}})
  expect((await f.adapter.extract(input)).warnings).toContain('OCR_COVERAGE_UNVERIFIED');noProviderOrMutation(f)
 })
})

describe('private completed raw result RPC',()=>{
 function setup(data:unknown={raw}){
  const rpc=vi.fn<AzureF0PrivateRpc>(async()=>({data,error:null})),authorize=vi.fn(async()=>true)
  return {rpc,authorize,store:createAzureF0JobStore({binding,rpc,authorize})}
 }
 it('reads a bounded snapshot through the separate scoped read-only RPC',async()=>{
  const f=setup(),result=await f.store.readCompletedRaw!(key)
  expect(result).toEqual(raw);expect(result).not.toBe(raw)
  expect(f.rpc).toHaveBeenCalledWith('c1_cost_ocr_azure_f0_read_result',{p_binding:binding,p_payload:{key,resourceId:host}})
  expect(f.authorize).toHaveBeenCalledTimes(2)
 })
 it.each(['before','after'] as const)('rejects changed actor/file/request versions %s the read',async phase=>{
  const f=setup();if(phase==='before')f.authorize.mockResolvedValueOnce(false)
  else f.authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
  await expect(f.store.readCompletedRaw!(key)).rejects.toThrow('AZURE_STORE_SCOPE_CHANGED')
  expect(f.rpc).toHaveBeenCalledTimes(phase==='before'?0:1)
 })
 it.each([null,{}, {raw:null},{raw,extra:'private'}, {raw:{content:'x'.repeat(4_000_001)}}])('rejects missing, malformed or excessive private evidence',async data=>{
  const f=setup(data);await expect(f.store.readCompletedRaw!(key)).rejects.toThrow('AZURE_STORE_RESPONSE_INVALID')
 })
 it('sanitizes private read errors and never retries through the mutation RPC',async()=>{
  const f=setup();f.rpc.mockRejectedValueOnce(Error('private provider evidence'))
  await expect(f.store.readCompletedRaw!(key)).rejects.toThrow(/^AZURE_STORE_UNAVAILABLE$/)
  expect(f.rpc).toHaveBeenCalledTimes(1)
  expect(f.rpc.mock.calls[0]?.[0]).toBe('c1_cost_ocr_azure_f0_read_result')
 })
 it.each(['actorId','companyId','fileVersion','requestVersion'] as const)('freshly rechecks the real request authorizer when %s changes during the read',async field=>{
  const expected={...binding,mimeType:'application/pdf',sizeBytes:bytes.length,permissions:['cost.prepare','cost.request.submit','cost.request.file.read','cost.request.read']}
  let fresh={...expected}
  const authorizer=createAzureF0RequestAuthorizer(expected,async()=>fresh)
  const rpc=vi.fn<AzureF0PrivateRpc>(async()=>{
   fresh={...fresh,[field]:typeof fresh[field]==='number'?(fresh[field] as number)+1:'c1f60000-0000-4000-8000-000000000002'}
   return {data:{raw},error:null}
  })
  const store=createAzureF0JobStore({binding,rpc,authorize:()=>authorizer(input)})
  await expect(store.readCompletedRaw!(key)).rejects.toThrow('AZURE_STORE_SCOPE_CHANGED')
  expect(rpc).toHaveBeenCalledTimes(1)
 })
})
