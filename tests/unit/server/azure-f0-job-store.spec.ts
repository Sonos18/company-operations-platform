import {createHash} from 'node:crypto'
import {describe,it,expect,vi} from 'vitest'
import {createAzureF0JobStore,type AzureF0Binding,type AzureF0PrivateRpc} from '../../../server/features/costs/extraction/azure-f0-job-store'
const host='taskovia-doc-intelligence-dev.cognitiveservices.azure.com'
const binding:AzureF0Binding={actorId:'c1f60000-0000-4000-8000-000000000901',tenantId:'c1f60000-0000-4000-8000-000000000010',companyId:'c1f60000-0000-4000-8000-000000000020',projectId:'c1f60000-0000-4000-8000-000000000101',fileId:'c1f60000-0000-4000-8000-000000000501',fileVersion:1,sha256:'a'.repeat(64),requestId:null,requestVersion:null}
const model='prebuilt-invoice' as const
const key=createHash('sha256').update(JSON.stringify([host,'v1',binding.companyId,binding.projectId,binding.fileId,binding.sha256,model])).digest('hex')
const reservation={key,resourceId:host,configurationVersion:'v1',month:'2026-10',pages:2,limit:500,scope:{companyId:binding.companyId,projectId:binding.projectId},fileId:binding.fileId,sha256:binding.sha256,model}
const url='https://'+host+'/documentintelligence/documentModels/'+model+'/analyzeResults/c1f60000-0000-4000-8000-000000000001?api-version=2024-11-30'
const result={status:'needs_review' as const,reviewRequired:true as const,fields:{},warnings:[],sourceLocations:[],methodVersion:'azure-f0-v1' as const}
function setup(data:unknown={job:{key,state:'reserved'}}){
 const rpc=vi.fn<AzureF0PrivateRpc>(async()=>({data,error:null}))
 const authorize=vi.fn(async()=>true)
 return {rpc,authorize,store:createAzureF0JobStore({binding,rpc,authorize})}
}
describe('Azure persistent private RPC port',()=>{
 it('uses only injected server RPC and copies the frozen binding',async()=>{
  const {store,rpc,authorize}=setup();expect(store.durability).toBe('persistent')
  expect(await store.reserve(reservation)).toEqual({job:{key,state:'reserved'}})
  expect(rpc).toHaveBeenCalledWith('c1_cost_ocr_azure_f0_job',{p_command:'reserve',p_binding:binding,p_payload:reservation})
  expect(authorize).toHaveBeenCalledTimes(2)
 })
 it.each(['quota','busy'] as const)('does not invent budget when DB returns %s',async(blocked)=>{
  const {store}=setup({blocked});expect(await store.reserve(reservation)).toEqual({blocked})
 })
 it.each([
  {scope:{companyId:'c1f60000-0000-4000-8000-000000000021',projectId:binding.projectId}},
  {fileId:'c1f60000-0000-4000-8000-000000000502'},{sha256:'b'.repeat(64)},
  {key:'b'.repeat(64)},{resourceId:'evil.invalid'},{pages:3},{limit:501},{month:'2026-00'}
 ])('rejects wrong identity, host and limits before RPC: %j',async(change)=>{
  const {store,rpc}=setup();await expect(store.reserve({...reservation,...change})).rejects.toThrow('AZURE_STORE_INPUT_INVALID');expect(rpc).not.toHaveBeenCalled()
 })
 it('fresh denial prevents persistence and hides an in-flight result after revocation',async()=>{
  const {store,rpc,authorize}=setup();authorize.mockResolvedValueOnce(false)
  await expect(store.reserve(reservation)).rejects.toThrow('AZURE_STORE_SCOPE_CHANGED');expect(rpc).not.toHaveBeenCalled()
  authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
  await expect(store.reserve(reservation)).rejects.toThrow('AZURE_STORE_SCOPE_CHANGED');expect(rpc).toHaveBeenCalledTimes(1)
 })
 it('sanitizes thrown/error/malformed database responses',async()=>{
  const {store,rpc}=setup();rpc.mockRejectedValueOnce(new Error('secret and signed URL'))
  await expect(store.reserve(reservation)).rejects.toThrow(/^AZURE_STORE_UNAVAILABLE$/)
  rpc.mockResolvedValueOnce({data:null,error:{message:'secret'}} as never)
  await expect(store.reserve(reservation)).rejects.toThrow(/^AZURE_STORE_UNAVAILABLE$/)
  rpc.mockResolvedValueOnce({data:{job:{key,state:'complete',result:{}}},error:null})
  await expect(store.reserve(reservation)).rejects.toThrow(/^AZURE_STORE_RESPONSE_INVALID$/)
 })
 it('requires exact returned identity and state-specific private operation',async()=>{
  for(const job of [{key:'b'.repeat(64),state:'reserved'},{key,state:'submitted',operationUrl:'https://evil.invalid/x',pollAfter:1},{key,state:'sending',operationUrl:url},{key,state:'complete',result:{...result,methodVersion:'excel-offline-v1'}}]){
   const {store}=setup({job});await expect(store.reserve(reservation)).rejects.toThrow('AZURE_STORE_RESPONSE_INVALID')
  }
 })
 it('delegates concurrent CAS to persistent DB; two instances share no local send cache',async()=>{
  let claimed=false
  const rpc=vi.fn(async()=>{const ok=!claimed;claimed=true;return {data:{ok},error:null}})
  const make=()=>createAzureF0JobStore({binding,rpc,authorize:async()=>true})
  expect(await Promise.all([make().claimSend(key),make().claimSend(key)])).toEqual([true,false])
  expect(rpc).toHaveBeenCalledTimes(2)
 })
 it('delegates acquisition to DB without caller time, returning its immutable lease',async()=>{
  const now=Date.now(),lease={token:'c1f60000-0000-4000-8000-000000000801',resourceId:host,kind:'get' as const,issuedAt:now,expiresAt:now+20_000}
  const {store,rpc,authorize}=setup({lease})
  const actual=await store.acquireDispatch(host,'get')
  expect(actual).toEqual(lease);expect(Object.isFrozen(actual)).toBe(true)
  expect(rpc.mock.calls[0]?.[1]).toEqual({p_command:'acquire',p_binding:binding,p_payload:{resourceId:host,kind:'get'}})
  expect(authorize).toHaveBeenCalledTimes(2)
  lease.token='c1f60000-0000-4000-8000-000000000802'
  expect(actual?.token).toBe('c1f60000-0000-4000-8000-000000000801')
 })
 it('returns DB denial for another runner or an expired lease without fabricating concurrency enforcement',async()=>{
  const first=setup({lease:null}),other=setup({lease:null})
  expect(await Promise.all([first.store.acquireDispatch(host,'post'),other.store.acquireDispatch(host,'get')])).toEqual([null,null])
  expect(first.rpc).toHaveBeenCalledTimes(1);expect(other.rpc).toHaveBeenCalledTimes(1)
  // Null is an injected private DB denial, not a simulation/proof of resource locks or expiry policy.
  expect(await first.store.acquireDispatch(host,'post')).toBeNull()
 })
 it.each([{resourceId:'evil.invalid',kind:'post'},{resourceId:host,kind:'delete'}])('rejects invalid acquire identity before RPC %j',async value=>{
  const {store,rpc}=setup({lease:null})
  await expect(store.acquireDispatch(value.resourceId,value.kind as never)).rejects.toThrow('AZURE_STORE_INPUT_INVALID')
  expect(rpc).not.toHaveBeenCalled()
 })
 it.each([
  {lease:undefined},{lease:'yes'},{lease:null,ok:true},{ok:true},
  {token:'invalid'},{resourceId:'evil.invalid'},{kind:'get'},
  {issuedAt:-1},{issuedAt:1.5},{issuedAt:NaN},{expiresAt:Number.MAX_SAFE_INTEGER+1},
  {expiresAt:1},{expiresAt:20_001},{issuedAt:1,expiresAt:20_002},
  {token:'c1f60000-0000-4000-8000-000000000801',unexpected:'owner'}
 ])('rejects malformed or mismatched private lease response %j',async patch=>{
  const now=Date.now(),lease={token:'c1f60000-0000-4000-8000-000000000801',resourceId:host,kind:'post',issuedAt:now,expiresAt:now+20_000}
  const response='lease' in patch||'ok' in patch?patch:{lease:{...lease,...patch}}
  const {store}=setup(response)
  await expect(store.acquireDispatch(host,'post')).rejects.toThrow('AZURE_STORE_RESPONSE_INVALID')
 })
 it('returns structurally valid expired/future-issued tokens for safe bookkeeping, never dispatch permission',async()=>{
  const now=Date.now()
  for(const issuedAt of [now-60_000,now+60_000]){
   const lease={token:'c1f60000-0000-4000-8000-000000000801',resourceId:host,kind:'post' as const,issuedAt,expiresAt:issuedAt+20_000}
   const {store}=setup({lease})
   expect(await store.acquireDispatch(host,'post')).toEqual(lease)
  }
  // Adapter/transport must check current time immediately before dispatch and release known-unused tokens.
 })
 it.each(['settled','unused','uncertain'] as const)('delegates %s release with only resource/token/outcome and immutable owner binding',async outcome=>{
  const issuedAt=Date.now()-60_000,lease={token:'c1f60000-0000-4000-8000-000000000801',resourceId:host,kind:'post' as const,issuedAt,expiresAt:issuedAt+20_000}
  const {store,rpc,authorize}=setup({ok:true})
  await expect(store.releaseDispatch(lease,outcome)).resolves.toBeUndefined()
  expect(rpc.mock.calls[0]?.[1]).toEqual({p_command:'release',p_binding:binding,p_payload:{resourceId:host,token:lease.token,outcome}})
  expect(authorize).toHaveBeenCalledTimes(2)
 })
 it.each([
  {resourceId:'evil.invalid'},{token:'invalid'},{kind:'delete'},
  {issuedAt:-1},{expiresAt:1},{expiresAt:NaN},{extra:'owner'},
 ])('rejects malformed release lease before RPC %j',async patch=>{
  const now=Date.now(),lease={token:'c1f60000-0000-4000-8000-000000000801',resourceId:host,kind:'post' as const,issuedAt:now,expiresAt:now+20_000}
  const {store,rpc}=setup({ok:true})
  await expect(store.releaseDispatch({...lease,...patch} as never,'settled')).rejects.toThrow('AZURE_STORE_INPUT_INVALID')
  expect(rpc).not.toHaveBeenCalled()
 })
 it('rejects unknown release outcome and propagates owner/token conflict without retry',async()=>{
  const now=Date.now(),lease={token:'c1f60000-0000-4000-8000-000000000801',resourceId:host,kind:'post' as const,issuedAt:now,expiresAt:now+20_000}
  const {store,rpc}=setup({ok:false})
  await expect(store.releaseDispatch(lease,'reset' as never)).rejects.toThrow('AZURE_STORE_INPUT_INVALID');expect(rpc).not.toHaveBeenCalled()
  // SQL denial is the ownership/unknown-token authority; no local lease map overrides it.
  await expect(store.releaseDispatch(lease,'settled')).rejects.toThrow('AZURE_STORE_CONFLICT');expect(rpc).toHaveBeenCalledTimes(1)
 })
 it('freshly authorizes before and after both acquisition and release',async()=>{
  const now=Date.now(),lease={token:'c1f60000-0000-4000-8000-000000000801',resourceId:host,kind:'post' as const,issuedAt:now,expiresAt:now+20_000}
  for(const phase of ['acquire','release'] as const){
   const {store,rpc,authorize}=setup(phase==='acquire'?{lease}:{ok:true})
   const action=()=>phase==='acquire'?store.acquireDispatch(host,'post'):store.releaseDispatch(lease,'unused')
   authorize.mockResolvedValueOnce(false)
   await expect(action()).rejects.toThrow('AZURE_STORE_SCOPE_CHANGED');expect(rpc).not.toHaveBeenCalled()
   authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
   await expect(action()).rejects.toThrow('AZURE_STORE_SCOPE_CHANGED');expect(rpc).toHaveBeenCalledTimes(1)
  }
 })
 it('sanitizes acquire/release private failures and rejects malformed release acknowledgement',async()=>{
  const now=Date.now(),lease={token:'c1f60000-0000-4000-8000-000000000801',resourceId:host,kind:'post' as const,issuedAt:now,expiresAt:now+20_000}
  for(const phase of ['acquire','release'] as const){
   const {store,rpc}=setup()
   const action=()=>phase==='acquire'?store.acquireDispatch(host,'post'):store.releaseDispatch(lease,'uncertain')
   rpc.mockRejectedValueOnce(new Error('synthetic private token'))
   await expect(action()).rejects.toThrow(/^AZURE_STORE_UNAVAILABLE$/)
   rpc.mockResolvedValueOnce({data:null,error:{message:'synthetic private token'}})
   await expect(action()).rejects.toThrow(/^AZURE_STORE_UNAVAILABLE$/)
  }
  const {store}=setup({ok:'yes'})
  await expect(store.releaseDispatch(lease,'unused')).rejects.toThrow('AZURE_STORE_RESPONSE_INVALID')
 })
 it('persists send uncertainty and immutable completion via private commands',async()=>{
  const {store,rpc}=setup({ok:true})
  await store.markUncertain(key);await store.saveOperation(key,url,Date.now()+60000);await store.complete(key,{status:'succeeded'},result)
  expect(rpc.mock.calls.map(call=>call[1].p_command)).toEqual(['uncertain','operation','complete'])
  expect(rpc.mock.calls.every(call=>call[1].p_binding.fileId===binding.fileId)).toBe(true)
 })
 it('does not swallow failed CAS or malformed mutation acknowledgements',async()=>{
  const {store}=setup({ok:false});await expect(store.markUncertain(key)).rejects.toThrow('AZURE_STORE_CONFLICT')
  const other=setup({ok:'yes'});await expect(other.store.claimSend(key)).rejects.toThrow('AZURE_STORE_RESPONSE_INVALID')
 })
 it('rejects decorated operation URLs, oversized raw and unreviewed results without RPC',async()=>{
  const {store,rpc}=setup({ok:true})
  for(const invalid of [url+'&key=SECRET',url.replace('https:','http:'),url+'#secret',url.replace(model,'prebuilt-read')]){
   await expect(store.saveOperation(key,invalid,1)).rejects.toThrow('AZURE_STORE_INPUT_INVALID')
  }
  await expect(store.complete(key,{content:'x'.repeat(4_000_001)},result)).rejects.toThrow('AZURE_STORE_INPUT_INVALID')
  await expect(store.complete(key,{}, {...result,reviewRequired:false} as never)).rejects.toThrow('AZURE_STORE_INPUT_INVALID')
  expect(rpc).not.toHaveBeenCalled()
 })
})
