import {workflowSha} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {spawn} from 'node:child_process'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {workflowLinkedRoot,readWorkflowLinkMetadata,assertWorkflowLinkUnchanged} from './c1-cost-workflow-rehearsal-link.mjs'

export const workflowQueryLimits={batchMs:180000,controlMs:20000,outputBytes:4*1024*1024}
// Only these exact reviewed READ ONLY full-snapshot bytes receive the allowance.
export const workflowSnapshotOutputAllowance=Object.freeze({sqlSha256:'b486e495fd5f1ed26c28fadde7400548a8a94e9c1523d23b515c0e5a48bba66d',outputBytes:8*1024*1024})

const cliDiagnostics=new WeakMap()
const safeGuardMessages=Object.freeze([
 'WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE','WORKFLOW_REHEARSAL_ADMISSION_EXPIRED','WORKFLOW_REHEARSAL_ADMISSION_STATE_CHANGED','WORKFLOW_REHEARSAL_CLI_EXPIRY_BOUND','WORKFLOW_REHEARSAL_ALREADY_APPLIED',
 'WORKFLOW_REHEARSAL_AUTH_HELPER_UNREVIEWED','WORKFLOW_REHEARSAL_FIXTURE_COLLISION',
 'WORKFLOW_REHEARSAL_FOREIGN_TABLE','WORKFLOW_REHEARSAL_FUNCTION_MISSING',
 'WORKFLOW_REHEARSAL_FUNCTION_UNREVIEWED','WORKFLOW_REHEARSAL_HISTORY_CHANGED',
 'WORKFLOW_REHEARSAL_HISTORY_TARGET_MISSING','WORKFLOW_REHEARSAL_HR_BASELINE_MISSING',
 'WORKFLOW_REHEARSAL_IMPLICIT_EXPRESSION_UNREVIEWED','WORKFLOW_REHEARSAL_IMPLICIT_FUNCTION_UNREVIEWED',
 'WORKFLOW_REHEARSAL_MANAGED_DDL_CHANGED','WORKFLOW_REHEARSAL_PGTAP_EXPECT_ABSENT',
 'WORKFLOW_REHEARSAL_PGTAP_INSTALLED_VERSION','WORKFLOW_REHEARSAL_PGTAP_NOT_INSTALLED',
 'WORKFLOW_REHEARSAL_PGTAP_PREREQUISITES','WORKFLOW_REHEARSAL_PGTAP_SCHEMA_CHANGED',
 'WORKFLOW_REHEARSAL_PGTAP_UNAVAILABLE','WORKFLOW_REHEARSAL_RELATION_CLOSURE_UNREVIEWED',
 'WORKFLOW_REHEARSAL_REWRITE_UNREVIEWED','WORKFLOW_REHEARSAL_SELECT_ONLY_IDENTITY',
 'WORKFLOW_REHEARSAL_SEQUENCE_BUDGET','WORKFLOW_REHEARSAL_SEQUENCE_OWNER',
 'WORKFLOW_REHEARSAL_SEQUENCE_RANGE','WORKFLOW_REHEARSAL_SEQUENCE_SETTINGS',
 'WORKFLOW_REHEARSAL_SEQUENCE_UNREVIEWED','WORKFLOW_REHEARSAL_SERVER_TIMEOUT_UNSUPPORTED',
 'WORKFLOW_REHEARSAL_TRIGGER_MISSING','WORKFLOW_REHEARSAL_TRIGGER_UNREVIEWED',
])
export function workflowCliDiagnostic(error){return cliDiagnostics.get(error)||null}
export function workflowWrapCliFailure(message,source){
 const error=new Error(message),diagnostic=workflowCliDiagnostic(source)
 if(diagnostic){cliDiagnostics.set(error,diagnostic);Object.defineProperty(error,'diagnostic',{value:diagnostic,enumerable:true})}
 return error
}

function primaryCliRecord(value){
 let message=value,jsonCode=null
 try{
  const payload=JSON.parse(value)
  if(payload&&typeof payload==='object'&&!Array.isArray(payload)){
   const error=payload.error&&typeof payload.error==='object'?payload.error:payload
   message=typeof error.message==='string'?error.message:typeof payload.error==='string'?payload.error:''
   jsonCode=/^[0-9A-Z]{5}$/.test(error.code)?error.code:null
  }
 }catch{/* Unsupported wrappers retain bounded metadata, not guessed error prose. */}
 let primary=null,context=null
 for(const line of message.split(/\r?\n/)){
  // Query/DETAIL/HINT dumps can contain valid-looking error literals. They are
  // never a source for primary state, guard attribution or location.
  if(/^\s*(?:STATEMENT|SQL|QUERY|DETAIL|HINT):/i.test(line))break
  if(!primary){
   if(/^\s*(?:Error:\s*)?(?:Failed to run sql query:\s*)?(?:ERROR:|SQLSTATE\b)/i.test(line))primary=line.trim()
  }else if(/^\s*(?:CONTEXT:\s*)?PL\/pgSQL function /i.test(line)){context=line.trim();break}
 }
 const sqlstate=jsonCode||(primary?/^\s*(?:Error:\s*)?(?:Failed to run sql query:\s*)?(?:ERROR:\s*([0-9A-Z]{5}):|SQLSTATE\s*[:=]?\s*([0-9A-Z]{5})\b)/.exec(primary)?.slice(1).find(Boolean)||/\(SQLSTATE ([0-9A-Z]{5})\)\s*$/.exec(primary)?.[1]:null)||null
 return {primary,context,sqlstate}
}

export function workflowCliFailure({stdout,stderr,status,sqlSha256}){

 const stderrRecord=primaryCliRecord(stderr),stdoutRecord=primaryCliRecord(stdout)
 const record=stderrRecord.primary||stderrRecord.sqlstate?stderrRecord:stdoutRecord
 const sqlstate=record.sqlstate
 const classifier=record.primary||stderr.split(/\r?\n/)[0]||stdout.split(/\r?\n/)[0]||''
 const category=sqlstate?'PG_'+sqlstate:/unknown flag|unknown command|Usage:/i.test(classifier)?'CLI_INTERFACE':/access token|unauthori[sz]ed|authentication|401|403/i.test(classifier)?'AUTH_REJECTED':/project ref|link|config/i.test(classifier)?'LINK_CONFIG':/connect|network|dial|TLS|certificate|timeout/i.test(classifier)?'CONNECTION':'COMMAND'
 const guard=/^\s*(?:Error:\s*)?(?:Failed to run sql query:\s*)?(?:ERROR:\s*(?:[0-9A-Z]{5}:\s*)?|SQLSTATE\s*[:=]?\s*[0-9A-Z]{5}\s+)(WORKFLOW_REHEARSAL_[A-Z_0-9]+)\b/.exec(record.primary||'')?.[1]
 const messageCode=safeGuardMessages.includes(guard)?guard:null
 const tap=messageCode==='WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE'?/WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE assertion=([1-9][0-9]{0,3}) sqlstate=([0-9A-Z]{5}|unknown)(?:\s|$)/.exec(record.primary||''):null
 const firstTapFailure=tap&&Number(tap[1])<=80?Object.freeze({assertion:Number(tap[1]),sqlstate:tap[2]==='unknown'?null:tap[2]}):null
 const match=/^(?:CONTEXT:\s*)?PL\/pgSQL function ([^\r\n]{1,200}?) line ([0-9]{1,6}) at (RAISE|SQL statement|RETURN|assignment|IF|PERFORM)\b/.exec(record.context||'')
 const location=match?Object.freeze({kind:'plpgsql',...(match[1]==='inline_code_block'?{function:'inline_code_block'}:{functionSha256:workflowSha(match[1])}),line:Number(match[2]),operation:match[3]}):null
 // Retain bounded facts, never arbitrary stderr prose, query/context bodies,
 // tokens, credentials or unknown guard/function names.
 const sanitizedSummary=[category,messageCode,location?'line '+location.line+' at '+location.operation:null].filter(Boolean).join('; ')
 const stream=value=>Object.freeze({bytes:Buffer.byteLength(value,'utf8'),sha256:workflowSha(value),sanitizedSummary})
 const diagnostic=Object.freeze({schemaVersion:1,kind:'native-cli-primary',category,sqlstate,messageCode,location,firstTapFailure,exitCode:Number.isInteger(status)?status:null,sqlSha256:/^[a-f0-9]{64}$/.test(sqlSha256)?sqlSha256:null,stdout:stream(stdout),stderr:stream(stderr)})
 if(Buffer.byteLength(JSON.stringify(diagnostic),'utf8')>2048)throw new Error('WORKFLOW_REHEARSAL_DIAGNOSTIC_INVALID')
 const error=new Error('WORKFLOW_REHEARSAL_EXECUTION_FAILED:'+category)
 cliDiagnostics.set(error,diagnostic);Object.defineProperty(error,'diagnostic',{value:diagnostic,enumerable:true})
 return error
}

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
  const outputBytes=workflowSha(sql)===workflowSnapshotOutputAllowance.sqlSha256?workflowSnapshotOutputAllowance.outputBytes:workflowQueryLimits.outputBytes
  writeFileSync(file,sql,{encoding:'utf8',mode:0o600})
   assertHeld();assertWorkflowLinkUnchanged(linkRoot,linkedMetadata)
   const response=await new Promise((resolve,reject)=>{
    // Run the frozen native binary directly: killing a Node wrapper would leave its child.
    const child=spawnProcess(binary,['db','query','--linked','--output-format','json','--file',file],{cwd:linkRoot,env:Object.fromEntries(Object.entries(env).filter(([key])=>!['DATABASE_URL','SUPABASE_DB_URL','SUPABASE_PROJECT_REF','SUPABASE_PROJECT_ID','SUPABASE_DB_PASSWORD','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS','SUPABASE_WORKDIR','SUPABASE_PROFILE'].includes(key))),stdio:['ignore','pipe','pipe']})
    const stdout=[],stderr=[]
    let bytes=0,failed=false,failureCode
    const fail=code=>{if(failed)return;failed=true;failureCode=code;child.kill('SIGKILL')}
    const timer=setTimeout(()=>fail('WORKFLOW_REHEARSAL_CLIENT_TIMEOUT'),timeoutMs)
    const collect=(parts,chunk)=>{const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>outputBytes)fail('WORKFLOW_REHEARSAL_OUTPUT_LIMIT');else parts.push(buffer)}
    child.stdout.on('data',chunk=>collect(stdout,chunk))
    child.stderr.on('data',chunk=>collect(stderr,chunk))
    child.once('error',()=>{clearTimeout(timer);fail('WORKFLOW_REHEARSAL_CLI_UNAVAILABLE')})
    child.once('close',status=>{
     clearTimeout(timer)
     if(failed)return reject(new Error(failureCode))
     let output,errorText
     try{
      // Decode complete bounded byte sequences once. Chunk boundaries must not
      // replace split Unicode characters or conceal truncated UTF-8.
      const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true})
      output=decoder.decode(Buffer.concat(stdout));errorText=decoder.decode(Buffer.concat(stderr))
     }catch{return reject(new Error('WORKFLOW_REHEARSAL_RESULT_INVALID'))}
     if(status!==0){
      return reject(workflowCliFailure({stdout:output,stderr:errorText,status,sqlSha256:workflowSha(sql)}))
     }
     try{resolve(JSON.parse(output))}catch{reject(new Error('WORKFLOW_REHEARSAL_RESULT_INVALID'))}
    })
   })
   // CLI 2.114.0 emits row arrays; keep the existing mocked envelope contract.
   const rows=Array.isArray(response)?response:response?.rows
   if(!Array.isArray(rows))throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
   return Array.isArray(response)?{rows}:response
  }finally{try{assertHeld();assertWorkflowLinkUnchanged(linkRoot,linkedMetadata)}finally{rmSync(directory,{recursive:true,force:true})}}
 }
}
