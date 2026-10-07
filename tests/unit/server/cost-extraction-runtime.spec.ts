import {createHash} from 'node:crypto'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {createRequestBoundCostExtractionAdapter} from '../../../server/features/costs/extraction/cost-extraction-runtime'
import type {CostExtractionRepository} from '../../../server/features/costs/extraction/cost-extraction.service'
const id='c1f70000-0000-4000-8000-000000000001'
const bytes=Uint8Array.from(Buffer.from('%PDF-1.7\nsynthetic'))
const sha256=createHash('sha256').update(bytes).digest('hex')
const context={actorId:id,tenantId:id,companyId:id,requestId:id,permissions:['cost.prepare','cost.request.submit','cost.request.file.read','cost.request.read'] as const}
const target={fileId:id,companyId:id,projectId:id,requestId:null,fileVersion:1,requestVersion:null,sha256,mimeType:'application/pdf',documentKind:'invoice',sizeBytes:bytes.length}
const input={fileId:id,mimeType:'application/pdf',documentKind:'invoice',bytes,scope:{companyId:id,projectId:id},pdfPageScope:'1-2' as const,pdfSourcePageCount:{kind:'user-declared' as const,count:4}}
const environment={TASKOVIA_COST_OCR_AZURE_ENABLED:'true',TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED:'true',TASKOVIA_COST_OCR_AZURE_ENDPOINT:'https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/',TASKOVIA_COST_OCR_AZURE_API_KEY:'synthetic-fixture-only'}
function setup(){
 const repository:CostExtractionRepository={readTarget:vi.fn(async()=>target),download:vi.fn(async()=>bytes),persist:vi.fn()}
 const refresh=vi.fn(async()=>({context,repository}))
 const rpc=vi.fn(async()=>({data:{blocked:'quota'},error:null})),rpcFactory=vi.fn(()=>rpc)
 return {repository,refresh,rpc,rpcFactory,value:{context,target,input,refresh}}
}
afterEach(()=>vi.restoreAllMocks())
describe('request-bound source wiring',()=>{
 it('disabled gates do not read provider credentials or construct a private RPC client',async()=>{
  const h=setup(),credential=vi.fn(()=>{throw new Error('credential read')})
  const env={TASKOVIA_COST_OCR_AZURE_ENABLED:'false',TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED:'true'}
  Object.defineProperty(env,'TASKOVIA_COST_OCR_AZURE_API_KEY',{get:credential})
  const adapter=createRequestBoundCostExtractionAdapter(h.value,{environment:env,rpcFactory:h.rpcFactory})
  await expect(adapter.extract(input)).resolves.toMatchObject({methodVersion:'offline-unavailable-v1',status:'unavailable'})
  expect(credential).not.toHaveBeenCalled();expect(h.rpcFactory).not.toHaveBeenCalled();expect(h.refresh).not.toHaveBeenCalled()
 })
 it('authorizes and admits original-bound PDF before durable reserve; quota refusal never calls provider',async()=>{
  const h=setup(),fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('unexpected HTTP'))
  const adapter=createRequestBoundCostExtractionAdapter(h.value,{environment,rpcFactory:h.rpcFactory})
  const result=await adapter.extract(input)
  expect(result.azurePdfCoverage).toMatchObject({requestedPages:[1,2],returnedPages:[],sourcePageCount:{kind:'user-declared',count:4},wholeDocumentComplete:false})
  expect(h.rpc.mock.calls[0]).toMatchObject(['c1_cost_ocr_azure_f0_job',{p_command:'reserve',p_payload:{pdfPageScope:'1-2',pages:2}}])
  expect(h.refresh.mock.calls.length).toBeGreaterThanOrEqual(4);expect(fetch).not.toHaveBeenCalled()
 })
 it('fresh permission revocation refuses before private RPC or provider',async()=>{
  const h=setup();h.refresh.mockResolvedValue({context:{...context,permissions:[] as unknown as typeof context.permissions},repository:h.repository})
  const result=await createRequestBoundCostExtractionAdapter(h.value,{environment,rpcFactory:h.rpcFactory}).extract(input)
  expect(result).toMatchObject({status:'unavailable',warnings:['OCR_SCOPE_CHANGED']})
  expect(h.rpcFactory).not.toHaveBeenCalled()
 })
 it('fresh changed request/original revision refuses before private RPC',async()=>{
  const h=setup();vi.mocked(h.repository.readTarget).mockResolvedValue({...target,fileVersion:2})
  const result=await createRequestBoundCostExtractionAdapter(h.value,{environment,rpcFactory:h.rpcFactory}).extract(input)
  expect(result.status).toBe('unavailable');expect(h.rpcFactory).not.toHaveBeenCalled()
 })
 it('a forged browser-independent adapter kind cannot select another model',async()=>{
  const h=setup(),fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('unexpected HTTP'))
  const result=await createRequestBoundCostExtractionAdapter(h.value,{environment,rpcFactory:h.rpcFactory}).extract({...input,documentKind:'quotation'})
  expect(result).toMatchObject({status:'unavailable',warnings:['OCR_SCOPE_CHANGED']})
  expect(h.rpcFactory).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
 })
 it('fresh stored kind change blocks quota even with unchanged original bytes',async()=>{
  const h=setup();vi.mocked(h.repository.readTarget).mockResolvedValue({...target,documentKind:'quotation'})
  const result=await createRequestBoundCostExtractionAdapter(h.value,{environment,rpcFactory:h.rpcFactory}).extract(input)
  expect(result.status).toBe('unavailable');expect(h.rpcFactory).not.toHaveBeenCalled()
 })

})
