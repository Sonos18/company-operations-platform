import {createHash} from 'node:crypto'
import {expect,it,vi} from 'vitest'
import * as azure from '../../../server/features/costs/extraction/azure-f0-cost-extraction'
import type {AzureF0DocumentMetadata} from '../../../server/features/costs/extraction/azure-f0-document-inspection'
import type {AzureF0PdfAdmissionContext,AzureF0PdfInput} from '../../../server/features/costs/extraction/azure-f0-pdf-admission'
const factory=azure.createAzureF0PdfAdmission
const id='11111111-1111-4111-8111-111111111111'
function fixture(){
 const bytes=Buffer.from('%PDF-1.7\nsynthetic unrendered test bytes\n%%EOF\n')
 const metadata:AzureF0DocumentMetadata={tenantId:id,companyId:id,projectId:id,fileId:id,fileVersion:2,sha256:createHash('sha256').update(bytes).digest('hex'),mimeType:'application/pdf',sizeBytes:bytes.length}
 const input:AzureF0PdfInput={fileId:id,mimeType:'application/pdf',bytes,scope:{companyId:id,projectId:id},pdfPageScope:'1-2'}
 let context:AzureF0PdfAdmissionContext={metadata:{...metadata},pdfPageScope:'1-2',sourcePageCount:{kind:'unknown'}}
 const read=vi.fn(async()=>context)
 expect(factory).toBeTypeOf('function')
 const admit=factory(metadata,read)
 return {metadata,input,read,admit,set:(value:AzureF0PdfAdmissionContext)=>{context=value},context:()=>context}
}
it('admits exact authorized PDF bytes and explicit two-page scope without decoding',async()=>{
 const f=fixture()
 expect(await f.admit(f.input)).toEqual({kind:'azure-pdf-scope-v1',admitted:true,sourceSha256:f.metadata.sha256,sourceByteLength:f.input.bytes.length,mimeType:'application/pdf',scope:'1-2',requestedPages:[1,2],reservedPageUnits:2,sourcePageCount:{kind:'unknown'},wholeDocumentComplete:false})
})
it('admits explicit first-page scope and preserves declared partial-source provenance',async()=>{
 const f=fixture();f.input.pdfPageScope='1';f.set({...f.context(),pdfPageScope:'1',sourcePageCount:{kind:'user-declared',count:9}})
 expect(await f.admit(f.input)).toMatchObject({scope:'1',requestedPages:[1],reservedPageUnits:1,sourcePageCount:{kind:'user-declared',count:9},wholeDocumentComplete:false})
})
it.each([undefined,null,'','1-3','2','01',1,[1,2]])('denies missing or invalid explicit scope %j before the private reader',async scope=>{
 const f=fixture();f.input.pdfPageScope=scope as never
 expect(await f.admit(f.input)).toBeNull();expect(f.read).not.toHaveBeenCalled()
})
it('denies a scope differing from the fresh authorized request choice',async()=>{
 const f=fixture();f.set({...f.context(),pdfPageScope:'1'})
 expect(await f.admit(f.input)).toBeNull()
})
it.each(['tenantId','companyId','projectId','fileId','fileVersion','sha256','mimeType','sizeBytes'] as const)('denies freshly changed original %s',async key=>{
 const f=fixture();const metadata={...f.metadata}
 if(key==='fileVersion'||key==='sizeBytes')metadata[key]++
 else metadata[key]=key==='sha256'?'0'.repeat(64):key==='mimeType'?'image/png':'22222222-2222-4222-8222-222222222222'
 f.set({...f.context(),metadata});expect(await f.admit(f.input)).toBeNull()
})
it.each(['fileId','companyId','projectId','mimeType','bytes'] as const)('denies caller mismatch %s before the private reader',async key=>{
 const f=fixture()
 if(key==='bytes')f.input.bytes=Buffer.from('%PDF-1.7\nwrong bytes')
 else if(key==='companyId'||key==='projectId')f.input.scope[key]='22222222-2222-4222-8222-222222222222'
 else f.input[key]=key==='mimeType'?'image/png':'22222222-2222-4222-8222-222222222222'
 expect(await f.admit(f.input)).toBeNull();expect(f.read).not.toHaveBeenCalled()
})
it.each([0,4_000_001])('denies invalid byte size %i without metadata/provider work',async size=>{
 const f=fixture();f.input.bytes=new Uint8Array(size)
 expect(await f.admit(f.input)).toBeNull();expect(f.read).not.toHaveBeenCalled()
})
it('denies non-PDF framing even when verified hash and MIME agree',async()=>{
 const f=fixture();const bytes=Buffer.from('not a PDF');const metadata={...f.metadata,sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}
 const read=vi.fn(async()=>({...f.context(),metadata}))
 expect(await factory(metadata,read)({...f.input,bytes})).toBeNull();expect(read).not.toHaveBeenCalled()
})
it.each([{kind:'trusted-metadata',count:1},{kind:'user-declared',count:0},{kind:'user-declared',count:1.5},{kind:'trusted-metadata',count:Number.MAX_SAFE_INTEGER+1},{kind:'unknown',count:2}])('denies invalid or insufficient page-count provenance %j',async value=>{
 const f=fixture();f.set({...f.context(),sourcePageCount:value as never});expect(await f.admit(f.input)).toBeNull()
})
it('does not promote trusted page-count metadata into entire-document completeness',async()=>{
 const f=fixture();f.set({...f.context(),sourcePageCount:{kind:'trusted-metadata',count:2}})
 expect(await f.admit(f.input)).toMatchObject({sourcePageCount:{kind:'trusted-metadata',count:2},wholeDocumentComplete:false})
})
it('pins caller bytes, MIME, original binding and page scope across the private await',async()=>{
 const f=fixture();f.read.mockImplementation(async()=>{
  f.input.bytes.fill(0);f.input.mimeType='image/png';f.input.pdfPageScope='1';f.input.fileId='changed';f.input.scope.companyId='changed'
  return f.context()
 })
 expect(await f.admit(f.input)).toMatchObject({sourceSha256:f.metadata.sha256,mimeType:'application/pdf',scope:'1-2',requestedPages:[1,2]})
})
it('pins construction metadata and freezes the admitted plan including page provenance',async()=>{
 const f=fixture();const hash=f.metadata.sha256;f.metadata.sha256='0'.repeat(64)
 const result=await f.admit(f.input)
 expect(result?.sourceSha256).toBe(hash)
 expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result?.requestedPages)).toBe(true);expect(Object.isFrozen(result?.sourcePageCount)).toBe(true)
})
it('sanitizes private metadata errors without producing a positive admission',async()=>{
 const f=fixture();f.read.mockRejectedValue(Error('synthetic sensitive error'))
 expect(await f.admit(f.input)).toBeNull()
})
it('rejects noncanonical construction-time identity rather than normalizing it into trust',async()=>{
 const f=fixture(),metadata={...f.metadata,tenantId:' '+f.metadata.tenantId}
 const read=vi.fn(async()=>({...f.context(),metadata}))
 expect(await factory(metadata,read)(f.input)).toBeNull();expect(read).not.toHaveBeenCalled()
})
it('checks the byte ceiling before allocating a snapshot of an oversized caller buffer',async()=>{
 const f=fixture();f.input.bytes=new Uint8Array(4_000_001)
 const snapshot=vi.spyOn(Uint8Array,'from')
 try{expect(await f.admit(f.input)).toBeNull();expect(snapshot.mock.calls.length).toBe(0)}
 finally{snapshot.mockRestore()}
})
it('preserves shared result refinements when integrating the required PDF coverage envelope',async()=>{
 const sharedPath='../../../shared/schemas/costs/cost-extraction'
 vi.resetModules()
 vi.doMock(sharedPath,async importOriginal=>{
  const actual=await importOriginal<typeof import('../../../shared/schemas/costs/cost-extraction')>()
  return {...actual,costExtractionResultSchema:actual.costExtractionResultSchema.superRefine((value,ctx)=>{
   if(value.fields.partyHint==='blocked by shared guard')ctx.addIssue({code:'custom',message:'shared guard'})
  })}
 })
 try{
  const pdf=await import('../../../server/features/costs/extraction/azure-f0-pdf-admission')
  const f=fixture(),admission=await f.admit(f.input)
  expect(admission).not.toBeNull()
  const result={status:'needs_review',reviewRequired:true,fields:{},warnings:[],sourceLocations:[],methodVersion:'azure-f0-v1',
   azurePdfCoverage:pdf.azureF0PdfCoverage(admission!,{analyzeResult:{pages:[{pageNumber:1},{pageNumber:2}]}})}
  expect(pdf.azureF0PdfExtractionResultSchema.safeParse(result).success).toBe(true)
  expect(pdf.azureF0PdfExtractionResultSchema.safeParse({...result,fields:{partyHint:'blocked by shared guard'}}).success).toBe(false)
 }finally{vi.doUnmock(sharedPath);vi.resetModules()}
})
