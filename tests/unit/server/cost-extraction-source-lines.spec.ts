import {describe,it,expect} from 'vitest'
import {costExtractionResultSchema} from '../../../shared/schemas/costs/cost-extraction'

function reviewedSource(){
 const sourceLines=[
  {description:'Cable',quantity:'2',unit:'m',unitPrice:'100',printedLineAmount:'200',calculatedLineAmount:'200',status:'reconciled',pageNumber:1,tableIndex:0,rowIndex:1},
  {description:'Connector',quantity:'3',unit:'piece',unitPrice:'50',printedLineAmount:'149',calculatedLineAmount:'150',status:'printed_amount_mismatch',pageNumber:2,tableIndex:1,rowIndex:0},
 ]
 const lines=sourceLines.filter(line=>line.status==='reconciled').map(({description,quantity,unit,unitPrice})=>({description,quantity,unit,unitPrice}))
 const providerLocations=sourceLines.flatMap((line,index)=>['description','quantity','unit','unitPrice','printedLineAmount'].map(field=>({field:`basis.sourceLines.${index}.${field}`,pageNumber:line.pageNumber,polygon:[1,1,2,1,2,2,1,2],confidence:field==='description'?0.6:0.99})))
 return {status:'needs_review',reviewRequired:true,fields:{amount:'377',currencyCode:'VND',basis:{kind:'materials',lines,sourceLines}},warnings:['TOTAL_REQUIRES_REVIEW','NUMBER_FORMAT_REQUIRES_REVIEW'],sourceLocations:[],providerLocations,methodVersion:'azure-f0-v1'}
}

describe('extraction-only material source line review contract',()=>{
 it('preserves all source candidates and only the ordered reconciled financial subset',()=>{
  const result=costExtractionResultSchema.parse(reviewedSource())
  expect(result.fields.basis).toMatchObject({kind:'materials',lines:[{description:'Cable',quantity:'2',unit:'m',unitPrice:'100'}],sourceLines:[{printedLineAmount:'200',status:'reconciled'},{printedLineAmount:'149',calculatedLineAmount:'150',status:'printed_amount_mismatch'}]})
 })
 it('keeps low original description confidence for review without changing it',()=>{
  expect(costExtractionResultSchema.parse(reviewedSource()).providerLocations?.[0]?.confidence).toBe(0.6)
 })
 it.each(['calculated','status','unsafe_applied','omitted_applied','duplicated_source','no_total','no_warning','wrong_method','wrong_currency','unavailable','low_financial','unknown_financial','missing_location','wrong_source_page'] as const)('rejects %s candidate evidence',kind=>{
  const value=reviewedSource()
  if(kind==='calculated')value.fields.basis.sourceLines[1]!.calculatedLineAmount='151'
  if(kind==='status')value.fields.basis.sourceLines[1]!.status='reconciled'
  if(kind==='unsafe_applied')value.fields.basis.lines.push({description:'Connector',quantity:'3',unit:'piece',unitPrice:'50'})
  if(kind==='omitted_applied')value.fields.basis.lines=[]
  if(kind==='duplicated_source'){
   value.fields.basis.sourceLines[1]!.pageNumber=1
   value.fields.basis.sourceLines[1]!.tableIndex=0
   value.fields.basis.sourceLines[1]!.rowIndex=1
  }
  if(kind==='no_total')value.fields.amount=''
  if(kind==='no_warning')value.warnings=[]
  if(kind==='wrong_method')value.methodVersion='excel-offline-v1'
  if(kind==='wrong_currency')value.fields.currencyCode='USD'
  if(kind==='unavailable')value.status='unavailable'
  if(kind==='low_financial')value.providerLocations.find(location=>location.field==='basis.sourceLines.0.quantity')!.confidence=0.79
  if(kind==='unknown_financial')delete (value.providerLocations.find(location=>location.field==='basis.sourceLines.0.quantity')! as {confidence?:number}).confidence
  if(kind==='missing_location')value.providerLocations=value.providerLocations.filter(location=>location.field!=='basis.sourceLines.1.printedLineAmount')
  if(kind==='wrong_source_page')value.providerLocations.find(location=>location.field==='basis.sourceLines.0.quantity')!.pageNumber=2
  expect(costExtractionResultSchema.safeParse(value).success).toBe(false)
 })
 it('keeps existing extraction results without sourceLines compatible',()=>{
  const value=reviewedSource()
  delete (value.fields.basis as {sourceLines?:unknown}).sourceLines
  expect(costExtractionResultSchema.safeParse(value).success).toBe(true)
 })
 it.each(['NaN','Infinity','not-money'])('rejects malformed money %s without throwing',amount=>{
  const value=reviewedSource();value.fields.basis.sourceLines[0]!.quantity=amount
  expect(()=>costExtractionResultSchema.safeParse(value)).not.toThrow()
  expect(costExtractionResultSchema.safeParse(value).success).toBe(false)
 })
 it('rejects a source row outside matched requested PDF pages even if its own locations agree',()=>{
  const value={...reviewedSource(),azurePdfCoverage:{kind:'azure-pdf-scope-v1',sourceSha256:'a'.repeat(64),sourceByteLength:100,requestedPages:[1],returnedPages:[1],requestedPagesMatched:true,sourcePageCount:{kind:'unknown'},wholeDocumentComplete:false,reviewRequired:true}}
  expect(costExtractionResultSchema.safeParse(value).success).toBe(false)
 })
})
