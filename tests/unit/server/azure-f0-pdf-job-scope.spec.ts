import {createHash} from 'node:crypto'
import {describe,it,expect,vi} from 'vitest'
import {createAzureF0JobStore} from '../../../server/features/costs/extraction/azure-f0-job-store'
const host='taskovia-doc-intelligence-dev.cognitiveservices.azure.com'
const id='c1f60000-0000-4000-8000-000000000001'
const binding={actorId:id,tenantId:id,companyId:id,projectId:id,fileId:id,fileVersion:1,sha256:'a'.repeat(64),requestId:null,requestVersion:null}
const base={resourceId:host,configurationVersion:'v1',month:'2026-10',pages:2,limit:500,scope:{companyId:id,projectId:id},fileId:id,sha256:binding.sha256,model:'prebuilt-layout' as const}
const legacy=[host,'v1',id,id,id,binding.sha256,'prebuilt-layout']
const digest=(values:unknown[])=>createHash('sha256').update(JSON.stringify(values)).digest('hex')
function setup(data:unknown){const rpc=vi.fn(async()=>({data,error:null}));return {rpc,store:createAzureF0JobStore({binding,rpc,authorize:async()=>true})}}
describe('PDF durable job scope identity',()=>{
 it.each(['1','1-2'] as const)('accepts the new exact scoped identity %s',async scope=>{
  const pages=scope==='1'?1:2,key=digest([...legacy,'azure-pdf-scope-v1',scope])
  const {rpc,store}=setup({job:{key,state:'reserved'}})
  await expect(store.reserve({...base,pages,key,pdfPageScope:scope})).resolves.toMatchObject({job:{key}})
  expect(rpc).toHaveBeenCalledTimes(1)
 })
 it('rejects a legacy key masquerading as an explicit PDF scope before RPC',async()=>{
  const key=digest(legacy),{rpc,store}=setup({job:{key,state:'reserved'}})
  await expect(store.reserve({...base,key,pdfPageScope:'1-2'})).rejects.toThrow('AZURE_STORE_INPUT_INVALID')
  expect(rpc).not.toHaveBeenCalled()
 })
 it('rejects mismatching reservation units and scope before RPC',async()=>{
  const key=digest([...legacy,'azure-pdf-scope-v1','1']),{rpc,store}=setup({job:{key,state:'reserved'}})
  await expect(store.reserve({...base,key,pdfPageScope:'1'})).rejects.toThrow('AZURE_STORE_INPUT_INVALID')
  expect(rpc).not.toHaveBeenCalled()
 })
 it('keeps the existing image reservation identity unchanged',async()=>{
  const key=digest(legacy),{store}=setup({job:{key,state:'reserved'}})
  await expect(store.reserve({...base,key})).resolves.toMatchObject({job:{key}})
 })
 it('rejects cached PDF results missing scope coverage without replacement dispatch',async()=>{
  const key=digest([...legacy,'azure-pdf-scope-v1','1-2']),url='https://'+host+'/documentintelligence/documentModels/prebuilt-layout/analyzeResults/'+id+'?api-version=2024-11-30'
  const {rpc,store}=setup({job:{key,state:'complete',operationUrl:url,pollAfter:1,result:{status:'needs_review',reviewRequired:true,fields:{},warnings:[],sourceLocations:[],methodVersion:'azure-f0-v1'}}})
  await expect(store.reserve({...base,key,pdfPageScope:'1-2'})).rejects.toThrow('AZURE_STORE_RESPONSE_INVALID')
  expect(rpc).toHaveBeenCalledTimes(1)
 })
})
