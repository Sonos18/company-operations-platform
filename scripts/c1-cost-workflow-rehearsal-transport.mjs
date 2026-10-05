import {spawn} from 'node:child_process'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {workflowLinkedRoot,readWorkflowLinkMetadata,assertWorkflowLinkUnchanged} from './c1-cost-workflow-rehearsal-link.mjs'

export const workflowQueryLimits={batchMs:180000,controlMs:20000,outputBytes:4*1024*1024}
export async function acquireWorkflowValidationLock({spawnProcess=spawn,platform=process.platform}={}){
 if(platform!=='linux')throw new Error('WORKFLOW_REHEARSAL_LOCK_PLATFORM')
 const child=spawnProcess('flock',['-n','-E','73','/data/remote-jobs/validation.lock','sh','-c','printf "LOCKED\\n"; read release'],{stdio:['pipe','pipe','pipe']})
 let alive=true
 child.stdin.on('error',()=>{})
 child.once('close',()=>{alive=false})
 const dispose=async()=>{
  if(!alive)return
  await new Promise(resolve=>{const timer=setTimeout(()=>child.kill('SIGKILL'),1000);child.once('close',()=>{clearTimeout(timer);resolve()});child.stdin.end('release\n')})
 }
 try{
  await new Promise((resolve,reject)=>{
   let output=''
   const timer=setTimeout(()=>reject(new Error('WORKFLOW_REHEARSAL_LOCK_TIMEOUT')),5000)
   const fail=code=>{clearTimeout(timer);reject(new Error(code))}
   child.once('error',()=>fail('WORKFLOW_REHEARSAL_LOCK_UNAVAILABLE'))
   child.once('close',()=>fail('WORKFLOW_REHEARSAL_LOCK_BUSY'))
   child.stdout.on('data',value=>{output+=String(value);if(output==='LOCKED\n'){clearTimeout(timer);resolve()}else if(output.length>7||output.includes('\n'))fail('WORKFLOW_REHEARSAL_LOCK_INVALID')})
  })
 }catch(error){await dispose();throw error}
 return {assertHeld(){if(!alive)throw new Error('WORKFLOW_REHEARSAL_LOCK_LOST')},release:dispose}
}
export function createWorkflowQuery({linkRoot=workflowLinkedRoot,linkedMetadata=readWorkflowLinkMetadata(linkRoot),env,binary,spawnProcess=spawn,assertHeld=()=>{}}){
 return async function query(sql,{timeoutMs=workflowQueryLimits.controlMs}={}){
  const directory=mkdtempSync(join(tmpdir(),'taskovia-cost-workflow-query-'))
  const file=join(directory,'query.sql')
  try{
  if(!sql.startsWith('/*c1cw-')&&!/^begin\b/i.test(sql.trim()))sql="begin read only;set local statement_timeout='10s';set local transaction_timeout='15s';"+sql+"rollback;"
  writeFileSync(file,sql,{encoding:'utf8',mode:0o600})
   assertHeld();assertWorkflowLinkUnchanged(linkRoot,linkedMetadata)
   const response=await new Promise((resolve,reject)=>{
    // Run the frozen native binary directly: killing a Node wrapper would leave its child.
    const child=spawnProcess(binary,['db','query','--linked','--output-format','json','--file',file],{cwd:linkRoot,env:Object.fromEntries(Object.entries(env).filter(([key])=>!['DATABASE_URL','SUPABASE_DB_URL','SUPABASE_PROJECT_REF','SUPABASE_PROJECT_ID','SUPABASE_DB_PASSWORD','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS','SUPABASE_WORKDIR','SUPABASE_PROFILE'].includes(key))),stdio:['ignore','pipe','pipe']})
    let stdout='',stderr='',bytes=0,failed=false,failureCode
    const fail=code=>{if(failed)return;failed=true;failureCode=code;child.kill('SIGKILL')}
    const timer=setTimeout(()=>fail('WORKFLOW_REHEARSAL_CLIENT_TIMEOUT'),timeoutMs)
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>workflowQueryLimits.outputBytes)fail('WORKFLOW_REHEARSAL_OUTPUT_LIMIT');else stdout+=chunk})
    child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>workflowQueryLimits.outputBytes)fail('WORKFLOW_REHEARSAL_OUTPUT_LIMIT');else stderr+=chunk})
    child.once('error',()=>{clearTimeout(timer);fail('WORKFLOW_REHEARSAL_CLI_UNAVAILABLE')})
    child.once('close',status=>{clearTimeout(timer);if(failed)return reject(new Error(failureCode));if(status!==0){const errorOutput=stdout+'\n'+stderr;const state=/SQLSTATE ([0-9A-Z]{5})/.exec(errorOutput)?.[1];const category=state?'PG_'+state:/unknown flag|unknown command|Usage:/i.test(errorOutput)?'CLI_INTERFACE':/access token|unauthori[sz]ed|authentication|401|403/i.test(errorOutput)?'AUTH_REJECTED':/project ref|link|config/i.test(errorOutput)?'LINK_CONFIG':/connect|network|dial|TLS|certificate|timeout/i.test(errorOutput)?'CONNECTION':'COMMAND';return reject(new Error('WORKFLOW_REHEARSAL_EXECUTION_FAILED:'+category))};try{resolve(JSON.parse(stdout))}catch{reject(new Error('WORKFLOW_REHEARSAL_RESULT_INVALID'))}})
   })
   // CLI 2.114.0 emits row arrays; keep the existing mocked envelope contract.
   const rows=Array.isArray(response)?response:response?.rows
   if(!Array.isArray(rows))throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
   return Array.isArray(response)?{rows}:response
  }finally{try{assertHeld();assertWorkflowLinkUnchanged(linkRoot,linkedMetadata)}finally{rmSync(directory,{recursive:true,force:true})}}
 }
}
