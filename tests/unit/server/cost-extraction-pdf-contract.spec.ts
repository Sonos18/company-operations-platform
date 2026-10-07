import {describe,it,expect} from 'vitest'
import {costExtractionCommandSchema,costExtractionResultSchema} from '../../../shared/schemas/costs/cost-extraction'
const coverage={kind:'azure-pdf-scope-v1',sourceSha256:'a'.repeat(64),sourceByteLength:80,requestedPages:[1,2],returnedPages:[1,2],requestedPagesMatched:true,sourcePageCount:{kind:'unknown'},wholeDocumentComplete:false,reviewRequired:true}
const result={status:'needs_review',reviewRequired:true,fields:{},warnings:[],sourceLocations:[],methodVersion:'azure-f0-v1'}
describe('explicit PDF scope and retained coverage',()=>{
 it('accepts explicit prefix and declared totals without accepting trusted client metadata',()=>{
  expect(costExtractionCommandSchema.parse({requestId:null,pdfPageScope:'1-2',pdfDeclaredPageCount:4})).toEqual({requestId:null,pdfPageScope:'1-2',pdfDeclaredPageCount:4})
  expect(costExtractionCommandSchema.safeParse({requestId:null,pdfPageScope:'all'}).success).toBe(false)
  expect(costExtractionCommandSchema.safeParse({requestId:null,pdfSourcePageCount:{kind:'trusted-metadata',count:4}}).success).toBe(false)
 })
 it.each([{documentKind:'invoice'},{model:'prebuilt-invoice'}])('rejects client model selection %j',extra=>{
  expect(costExtractionCommandSchema.safeParse({requestId:null,pdfPageScope:'1',...extra}).success).toBe(false)
 })
 it('round trips exact partial coverage without claiming complete document',()=>{
  expect(costExtractionResultSchema.parse({...result,azurePdfCoverage:coverage}).azurePdfCoverage).toEqual(coverage)
  expect(costExtractionResultSchema.safeParse({...result,azurePdfCoverage:{...coverage,wholeDocumentComplete:true}}).success).toBe(false)
 })
 it.each([{returnedPages:[1]},{returnedPages:[1,1]},{returnedPages:[1,2,3]}])('rejects false successful coverage claims for returned pages %j',({returnedPages})=>{
  expect(costExtractionResultSchema.safeParse({...result,azurePdfCoverage:{...coverage,returnedPages}}).success).toBe(false)
 })
 it('retains unmatched coverage as review-only and refuses extracted hints',()=>{
  const raw={...result,status:'unavailable',warnings:['OCR_COVERAGE_UNVERIFIED'],azurePdfCoverage:{...coverage,returnedPages:[1],requestedPagesMatched:false}}
  expect(costExtractionResultSchema.safeParse(raw).success).toBe(true)
  expect(costExtractionResultSchema.safeParse({...raw,fields:{amount:'10'}}).success).toBe(false)
 })
})
