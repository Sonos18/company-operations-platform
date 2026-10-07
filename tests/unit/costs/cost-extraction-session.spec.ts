import {describe,it,expect,vi} from 'vitest'
import {createEvidenceExtractionSession} from '../../../app/utils/costs/cost-extraction-session'
const id='c1f80000-0000-4000-8000-000000000001'
const view={extractionId:id,fileId:id,requestId:null,replayed:false,result:{status:'unavailable' as const,reviewRequired:true as const,fields:{},warnings:[],sourceLocations:[],methodVersion:'offline-unavailable-v1' as const}}
describe('reviewed extraction retry session',()=>{
 it('retries the identical frozen page selection and idempotency key after a lost response',async()=>{
  const extractEvidence=vi.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValue(view)
  const session=createEvidenceExtractionSession({projectId:id,repository:{extractEvidence},isScopeCurrent:()=>true,key:()=>id})
  const selection={requestId:null,pdfPageScope:'1-2' as const,pdfDeclaredPageCount:4}
  await expect(session.scan(id,selection)).rejects.toThrow('response lost')
  expect(session.pendingFileId).toBe(id)
  await expect(session.scan(id,{...selection,pdfPageScope:'1'})).rejects.toThrow('EXTRACTION_COMMAND_PENDING')
  expect(extractEvidence).toHaveBeenCalledTimes(1)
  await expect(session.scan(id,selection)).resolves.toEqual(view)
  expect(extractEvidence.mock.calls[1]).toEqual(extractEvidence.mock.calls[0])
  expect(session.pendingFileId).toBeNull()
 })
 it('scope invalidation prevents a pending retry from writing to its old project',async()=>{
  let current=true;const extractEvidence=vi.fn().mockRejectedValue(new Error('lost'))
  const session=createEvidenceExtractionSession({projectId:id,repository:{extractEvidence},isScopeCurrent:()=>current,key:()=>id})
  await expect(session.scan(id,{requestId:null,pdfPageScope:'1'})).rejects.toThrow('lost')
  current=false
  await expect(session.scan(id,{requestId:null,pdfPageScope:'1'})).rejects.toThrow('EXTRACTION_SCOPE_CHANGED')
  expect(extractEvidence).toHaveBeenCalledTimes(1)
 })
 it('rejects declared totals below the requested prefix before sending any command',async()=>{
  const extractEvidence=vi.fn()
  const session=createEvidenceExtractionSession({projectId:id,repository:{extractEvidence},isScopeCurrent:()=>true,key:()=>id})
  await expect(session.scan(id,{requestId:null,pdfPageScope:'1-2',pdfDeclaredPageCount:1})).rejects.toThrow()
  expect(extractEvidence).not.toHaveBeenCalled()
 })
})
