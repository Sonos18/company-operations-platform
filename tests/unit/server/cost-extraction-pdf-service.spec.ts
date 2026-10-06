import {createHash} from 'node:crypto'
import {describe,it,expect,vi} from 'vitest'
import type {ExtractionResult,AzureF0PdfCoverage,CostExtractionAdapter} from '../../../shared/schemas/costs/cost-extraction'
import {CostExtractionService,type CostExtractionRepository,type CostExtractionServiceOptions} from '../../../server/features/costs/extraction/cost-extraction.service'
const id='c1f50000-0000-4000-8000-000000000001'
const context={actorId:id,tenantId:id,companyId:id,requestId:id,permissions:['cost.prepare','cost.request.submit','cost.request.file.read','cost.request.read'] as const}
const bytes=Uint8Array.from([37,80,68,70])
const sha=createHash('sha256').update(bytes).digest('hex')
const target={fileId:id,companyId:id,projectId:id,requestId:null,fileVersion:1,requestVersion:null,sha256:sha,mimeType:'application/pdf',sizeBytes:4}
const coverage:AzureF0PdfCoverage={kind:'azure-pdf-scope-v1',sourceSha256:sha,sourceByteLength:4,requestedPages:[1,2],returnedPages:[1,2],requestedPagesMatched:true,sourcePageCount:{kind:'user-declared',count:4},wholeDocumentComplete:false,reviewRequired:true}
const result:ExtractionResult={status:'needs_review',reviewRequired:true,fields:{},warnings:[],sourceLocations:[],methodVersion:'azure-f0-v1',azurePdfCoverage:coverage}
function setup(){
 const repository={readTarget:vi.fn<CostExtractionRepository['readTarget']>(async()=>target),download:vi.fn(async()=>bytes),persist:vi.fn<CostExtractionRepository['persist']>(async(_c,_p,_target,result)=>({extractionId:id,fileId:id,requestId:null,result,replayed:false}))}
 const adapter={extract:vi.fn<CostExtractionAdapter['extract']>(async()=>structuredClone(result))}
 const refresh=vi.fn<NonNullable<CostExtractionServiceOptions['refresh']>>(async()=>({context,repository}))
 return {repository,adapter,refresh,service:new CostExtractionService(repository,adapter,{refresh})}
}
describe('PDF extraction service scope and fresh persistence',()=>{
 it('pins explicit scope and user-declared total across asynchronous provider work',async()=>{
  const h=setup(),selection={pdfPageScope:'1-2' as const,pdfDeclaredPageCount:4}
  const view=await h.service.extract(context,id,null,id,id,selection)
  expect(h.adapter.extract.mock.calls[0]?.[0]).toMatchObject({pdfPageScope:'1-2',pdfSourcePageCount:{kind:'user-declared',count:4}})
  expect(view.result.azurePdfCoverage).toEqual(coverage)
  expect(h.refresh).toHaveBeenCalledTimes(2)
 })
 it('fresh denial after extraction blocks result persistence',async()=>{
  const h=setup();h.refresh.mockResolvedValue({context:{...context,permissions:[]},repository:h.repository})
  await expect(h.service.extract(context,id,null,id,id,{pdfPageScope:'1-2',pdfDeclaredPageCount:4})).rejects.toMatchObject({statusCode:403})
  expect(h.repository.persist).not.toHaveBeenCalled()
 })
 it('changed immutable/request target blocks stale persistence',async()=>{
  const h=setup();h.repository.readTarget.mockResolvedValueOnce(target).mockResolvedValue({...target,fileVersion:2})
  await expect(h.service.extract(context,id,null,id,id,{pdfPageScope:'1-2',pdfDeclaredPageCount:4})).rejects.toMatchObject({statusCode:409})
  expect(h.repository.persist).not.toHaveBeenCalled()
 })
 it('refuses missing coverage rather than exposing a legacy cached Azure PDF result',async()=>{
  const h=setup();h.adapter.extract.mockResolvedValue({...result,azurePdfCoverage:undefined})
  await expect(h.service.extract(context,id,null,id,id,{pdfPageScope:'1-2',pdfDeclaredPageCount:4})).rejects.toMatchObject({statusCode:500})
  expect(h.repository.persist).not.toHaveBeenCalled()
 })
 it.each([undefined,'1-2'] as const)('persists a safe non-provider rejection without fictitious coverage (%s)',async pdfPageScope=>{
  const h=setup();h.adapter.extract.mockResolvedValue({status:'unavailable',reviewRequired:true,fields:{},warnings:['OCR_COVERAGE_UNVERIFIED'],sourceLocations:[],methodVersion:'azure-f0-v1'})
  const view=await h.service.extract(context,id,null,id,id,pdfPageScope?{pdfPageScope}:{})
  expect(h.repository.persist.mock.calls[0]?.[3]).toMatchObject({methodVersion:'offline-unavailable-v1',status:'unavailable',fields:{}})
  expect(view.result.azurePdfCoverage).toBeUndefined()
 })
 it('does not normalize a rejected PDF carrying financial hints',async()=>{
  const h=setup();h.adapter.extract.mockResolvedValue({status:'unavailable',reviewRequired:true,fields:{amount:'10'},warnings:[],sourceLocations:[],methodVersion:'azure-f0-v1'})
  await expect(h.service.extract(context,id,null,id,id,{pdfPageScope:'1-2'})).rejects.toMatchObject({statusCode:500})
  expect(h.repository.persist).not.toHaveBeenCalled()
 })
 it('passes only the trusted server document kind to the adapter',async()=>{
  const h=setup();h.repository.readTarget.mockResolvedValue({...target,documentKind:'quotation'})
  await h.service.extract(context,id,null,id,id,{pdfPageScope:'1-2',pdfDeclaredPageCount:4})
  expect(h.adapter.extract.mock.calls[0]?.[0].documentKind).toBe('quotation')
 })
 it('changed trusted kind blocks stale result persistence even with unchanged bytes',async()=>{
  const h=setup();h.repository.readTarget.mockResolvedValueOnce({...target,documentKind:'invoice'}).mockResolvedValue({...target,documentKind:'quotation'})
  await expect(h.service.extract(context,id,null,id,id,{pdfPageScope:'1-2',pdfDeclaredPageCount:4})).rejects.toMatchObject({statusCode:409})
  expect(h.repository.persist).not.toHaveBeenCalled()
 })
 it('rejects a completed replay for the wrong explicit prefix',async()=>{
  const h=setup();h.repository.persist.mockResolvedValue({extractionId:id,fileId:id,requestId:null,replayed:true,result:{...result,azurePdfCoverage:{...coverage,requestedPages:[1],returnedPages:[1]}}})
  await expect(h.service.extract(context,id,null,id,id,{pdfPageScope:'1-2',pdfDeclaredPageCount:4})).rejects.toMatchObject({statusCode:500})
 })
})
