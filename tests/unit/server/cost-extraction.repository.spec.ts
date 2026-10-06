import {createHash} from 'node:crypto'
import {describe,expect,it,vi} from 'vitest'
import type {UserSupabaseClient} from '../../../server/utils/supabase-client'
import {SupabaseCostExtractionRepository} from '../../../server/features/costs/extraction/cost-extraction.repository'
const id='c1f50000-0000-4000-8000-000000000001'
const c={companyId:id,tenantId:id,actorId:id,requestId:id,permissions:[]}
const bytes=new Uint8Array([1,2,3])
const target={fileId:id,companyId:id,projectId:id,requestId:null,fileVersion:1,requestVersion:null,sha256:createHash('sha256').update(bytes).digest('hex'),mimeType:'image/png',documentKind:null,sizeBytes:3,bucketId:'c1-accounting-evidence',objectPath:[id,id,id,id].join('/')}
function repository(data:unknown){const rpc=vi.fn().mockResolvedValue({data,error:null}),download=vi.fn().mockResolvedValue({data:new Blob([bytes]),error:null});return {rpc,download,repository:new SupabaseCostExtractionRepository({rpc,storage:{from:()=>({download})}} as unknown as UserSupabaseClient)}}
describe('original byte and revision extraction boundary',()=>{
 it('refuses a forged Storage object path before any original download',async()=>{const r=repository({...target,objectPath:'unscoped-object'});await expect(r.repository.readTarget(c,id,null,id)).rejects.toMatchObject({statusCode:500});expect(r.download).not.toHaveBeenCalled()})
 it('does not download after a request/file revision changes during work',async()=>{const r=repository({...target,fileVersion:2});await expect(r.repository.download(c,id,target)).rejects.toMatchObject({statusCode:409,code:'VERSION_CONFLICT'});expect(r.download).not.toHaveBeenCalled()})
 it('projects the immutable finalized document kind without a browser model flag',async()=>{const r=repository({...target,documentKind:'invoice'});await expect(r.repository.readTarget(c,id,null,id)).resolves.toMatchObject({documentKind:'invoice'})})
 it('checks original bytes against the immutable server-verified digest',async()=>{const r=repository(target);r.download.mockResolvedValue({data:new Blob([new Uint8Array([4,5,6])]),error:null});await expect(r.repository.download(c,id,target)).rejects.toMatchObject({statusCode:409,code:'EVIDENCE_UPLOAD_MISMATCH'})})
})
