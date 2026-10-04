import { describe, expect, it, vi } from 'vitest'
import { SupabaseWorkflowEvidenceRepository } from '../../../server/features/costs/workflow/cost-workflow-evidence.repository'
import type { UserSupabaseClient } from '../../../server/utils/supabase-client'
const id='c1f50000-0000-4000-8000-000000000001'
const project='c1f50000-0000-4000-8000-000000000002'
const file='c1f50000-0000-4000-8000-000000000003'
const context={actorId:id,tenantId:id,companyId:id,requestId:id,permissions:[]}
function fixture(){
 const sign=vi.fn(async()=>({data:{signedUrl:'https://example.invalid/signed'},error:null}))
 const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>=>({data:{bucketId:'c1-accounting-evidence',objectPath:'scoped-object'},error:null}))
 const bucket=vi.fn(()=>({createSignedUrl:sign}))
 const client={rpc,storage:{from:bucket}}
 return {rpc,sign,bucket,client:client as unknown as UserSupabaseClient}
}
describe('workflow original repository',()=>{
 it('checks a fresh assignment and complete route scope before every signed URL',async()=>{
  const f=fixture();await new SupabaseWorkflowEvidenceRepository(f.client).createReadUrl(context,project,file,{disposition:'attachment'})
  expect(f.rpc).toHaveBeenCalledWith('c1_workflow_evidence_read_target',{target_company_id:id,target_project_id:project,target_id:file})
  expect(f.sign).toHaveBeenCalledWith('scoped-object',60,{download:true})
 })
 it('does not ask Storage to sign when assignment was revoked',async()=>{
  const f=fixture();f.rpc.mockResolvedValueOnce({data:null,error:{message:'PERMISSION_DENIED'}})
  await expect(new SupabaseWorkflowEvidenceRepository(f.client).createReadUrl(context,project,file,{disposition:'inline'})).rejects.toMatchObject({statusCode:403,code:'PERMISSION_DENIED'})
  expect(f.sign).not.toHaveBeenCalled()
 })
 it('refuses another bucket even when RPC shape is otherwise valid',async()=>{
  const f=fixture();f.rpc.mockResolvedValueOnce({data:{bucketId:'public',objectPath:'wrong'},error:null})
  await expect(new SupabaseWorkflowEvidenceRepository(f.client).createReadUrl(context,project,file,{disposition:'inline'})).rejects.toMatchObject({statusCode:500})
  expect(f.sign).not.toHaveBeenCalled()
 })
 it('checks finalization file/project identity before downloading or using server authority',async()=>{
  const f=fixture();f.rpc.mockResolvedValueOnce({data:null,error:{message:'RESOURCE_NOT_FOUND'}})
  const finalizer={finalize:vi.fn()}
  await expect(new SupabaseWorkflowEvidenceRepository(f.client,finalizer).finalize(context,project,file,{expectedVersion:0},id)).rejects.toMatchObject({statusCode:404})
  expect(finalizer.finalize).not.toHaveBeenCalled()
  expect(f.rpc).toHaveBeenCalledWith('c1_workflow_evidence_finalization_target',{target_company_id:id,target_project_id:project,target_id:file})
 })
})
