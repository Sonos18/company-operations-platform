import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {assertCloudDevTarget,resolveCloudDevConfigSource,CANONICAL_DEV_PROJECT_REF} from './assert-cloud-dev-target.mjs'
export function workflowUserRpc({cwd=process.cwd(),env=process.env,fetchImpl=fetch}={}){
 assertCloudDevTarget({cwd,env})
 const token=env.TASKOVIA_WORKFLOW_USER_TOKEN
 if(!token||token.split('.').length!==3)throw new Error('WORKFLOW_USER_SESSION_REQUIRED')
 const source=resolveCloudDevConfigSource(env)
 const key=source==='environment'?env.NUXT_PUBLIC_SUPABASE_ANON_KEY:readFileSync(resolve(cwd,'.env.local'),'utf8').split(/\r?\n/).find(v=>v.startsWith('NUXT_PUBLIC_SUPABASE_ANON_KEY='))?.slice('NUXT_PUBLIC_SUPABASE_ANON_KEY='.length).trim()
 return async(name,args)=>{
  if(!['c1_workflow_inventory','c1_workflow_cash_snapshot','c1_workflow_reconcile_legacy_cash'].includes(name))throw new Error('WORKFLOW_RPC_NOT_ALLOWED')
  const response=await fetchImpl('https://'+CANONICAL_DEV_PROJECT_REF+'.supabase.co/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(30000)})
  if(!response.ok)throw new Error('WORKFLOW_RPC_FAILED:'+response.status)
  return response.json()
 }
}
