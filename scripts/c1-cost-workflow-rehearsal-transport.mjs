import {workflowSha} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {spawn} from 'node:child_process'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {workflowLinkedRoot,readWorkflowLinkMetadata,assertWorkflowLinkUnchanged} from './c1-cost-workflow-rehearsal-link.mjs'

export const workflowQueryLimits={batchMs:180000,controlMs:20000,outputBytes:4*1024*1024}
// Only these exact reviewed READ ONLY full-snapshot bytes receive the allowance.
export const workflowSnapshotPairOutputAllowance=Object.freeze({sqlSha256:'bf92641b7d6bbf2ddaefd0323c41ba09589c7cc1fc071778e5d2e63064301961',outputBytes:8*1024*1024})
export const workflowSnapshotOutputAllowance=Object.freeze({sqlSha256:'b486e495fd5f1ed26c28fadde7400548a8a94e9c1523d23b515c0e5a48bba66d',outputBytes:8*1024*1024})

const cliDiagnostics=new WeakMap()
const safeGuardMessages=Object.freeze([
 'WORKFLOW_REHEARSAL_AZURE_ALREADY_INSTALLED','AZURE_FIXTURE_PGTAP_REQUIRED','AZURE_FIXTURE_PREREQUISITE_REQUIRED','AZURE_FIXTURE_MONTH_BOUNDARY','AZURE_FIXTURE_FRESH_SESSION_REQUIRED','AZURE_FIXTURE_RESOURCE_NOT_EMPTY','AZURE_FIXTURE_ID_COLLISION','AZURE_FIXTURE_SEQUENCE_REVIEW_REQUIRED','AZURE_FIXTURE_TRIGGER_REVIEW_REQUIRED',
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


function maskQuotedValues(value){
 let masked=''
 for(let i=0;i<value.length;){
  const quote=value[i]
  if(quote!=='"'&&quote!=="'"){masked+=quote;i++;continue}
  masked+='[redacted]';i++
  while(i<value.length){
   if(value[i]==='\\'){i+=2;continue}
   if(value[i]===quote){
    if(value[i+1]===quote){i+=2;continue}
    i++;break
   }
   i++
  }
 }
 return masked
}

function primaryCliRecord(value){
 let message=Buffer.isBuffer(value)?value.toString('utf8'):value,sqlstate=null,context=null,structured=false,httpStatus=null
 // Only error/message fields are authoritative. Never recurse into query,
 // details, hints, arbitrary object values or quoted SQL.
 for(let depth=0;depth<4;depth++){
  let payload
  try{payload=JSON.parse(message)}catch{break}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))break
  const error=payload.error&&typeof payload.error==='object'?payload.error:payload
  if(typeof error.message!=='string'&&typeof payload.error!=='string')break
  structured=true
  sqlstate=/^[0-9A-Z]{5}$/.test(error.code)?error.code:sqlstate
  context=typeof error.context==='string'?error.context:context
  message=typeof error.message==='string'?error.message:payload.error
  // Installed CLI 2.114.0's typed linked-query error wraps the API JSON body.
  const http=error.code==='LegacyDbQueryUnexpectedStatusError'?/^unexpected status ([1-5][0-9]{2}):\s*(\{[\s\S]*\})$/.exec(message):null
  if(!http)break
  httpStatus=Number(http[1]);message=http[2]
 }
 const lines=message.split(/\r?\n/),primary=lines.find(line=>line.trim())?.trim()||null
 if(!primary||/^(?:STATEMENT|SQL|QUERY|DETAIL|HINT):/i.test(primary))return {primary:null,context:null,sqlstate:null,structured,httpStatus}
 // Text errors must start at the first nonempty line. Scanning later lines
 // would attribute error-looking literals in an unlabelled SQL dump.
 if(!context){
  for(const line of lines.slice(lines.indexOf(lines.find(line=>line.trim()))+1)){
   if(/^\s*(?:STATEMENT|SQL|QUERY|DETAIL|HINT):/i.test(line))break
   if(!line.trim())continue
   if(/^\s*(?:CONTEXT:\s*)?PL\/pgSQL function /i.test(line))context=line.trim()
   break
  }
 }
 const unquoted=maskQuotedValues(primary)
 sqlstate ||= /^\s*(?:Error:\s*)?(?:Failed to run sql query:\s*)?(?:ERROR:\s*([0-9A-Z]{5}):|SQLSTATE\s*[:=]?\s*([0-9A-Z]{5})\b)/.exec(unquoted)?.slice(1).find(Boolean)||/\(SQLSTATE ([0-9A-Z]{5})\)\s*$/.exec(unquoted)?.[1]||null
 const primaryMessage=primary.replace(/^(?:Error:\s*)?(?:Failed to run sql query:\s*)?(?:ERROR:\s*(?:[0-9A-Z]{5}:\s*)?|SQLSTATE\s*[:=]?\s*[0-9A-Z]{5}\s*)/,'').replace(/\s*\(SQLSTATE [0-9A-Z]{5}\)\s*$/,'')
 return {primary,primaryMessage,context,sqlstate,structured,httpStatus}
}

function retainedPrimary(message){
 // Retain useful ordinary error wording independently of guard classification,
 // while excluding quoted values, credentials, URLs, identifiers and SQL tails.
 const redacted=maskQuotedValues(message)
  .replace(/\b(?:SQL|QUERY|STATEMENT)\s*[=:][\s\S]*/gi,'[redacted]')
  .replace(/\b[A-Za-z0-9_-]+\s*=\s*\S+/g,'[redacted]')
  .replace(/\b(?:Bearer\s+)\S+/gi,'[redacted]')
  .replace(/\b(?:https?|postgres(?:ql)?):\/\/\S+/gi,'[redacted]')
  .replace(/\b(?:sbp_|sb_secret_|eyJ)[A-Za-z0-9_.-]+/g,'[redacted]')
  .replace(/\b[A-Za-z0-9_-]{32,}\b/g,word=>safeGuardMessages.includes(word)?word:'[redacted]')
  .replace(/\b(?:WORKFLOW_REHEARSAL|AZURE_FIXTURE)_[A-Z_0-9]+\b/g,word=>safeGuardMessages.includes(word)?word:'[unreviewed guard]')
  .replace(/((?:at or near|syntax error near|for table|for schema|for function|constraint|relation|column)\s+)(?!\[redacted\])[\w.-]+/gi,'$1[redacted]')
  .replace(/[\p{Cc}]/gu,' ')
 let value=''
 for(const character of redacted){if(Buffer.byteLength(value+character,'utf8')>512)break;value+=character}
 return {primaryMessage:value,primaryMessageSha256:workflowSha(message),primaryMessageTruncated:value!==redacted}
}

const commandFailureMessages=Object.freeze({
 WORKFLOW_REHEARSAL_CLIENT_TIMEOUT:'Native query exceeded the client timeout',
 WORKFLOW_REHEARSAL_OUTPUT_LIMIT:'Native query exceeded the output limit',
 WORKFLOW_REHEARSAL_CLI_UNAVAILABLE:'Native CLI could not be started',
 WORKFLOW_REHEARSAL_RESULT_INVALID:'Native CLI returned invalid result data',
})

export function workflowCliFailure({stdout,stderr,status,sqlSha256,maximumTapAssertion=80,commandFailure=null,streamsComplete=true}){
 if(![80,124].includes(maximumTapAssertion)||commandFailure!==null&&!Object.hasOwn(commandFailureMessages,commandFailure))throw Error('WORKFLOW_REHEARSAL_DIAGNOSTIC_INVALID')

 const empty={primary:null,primaryMessage:null,context:null,sqlstate:null,structured:false,httpStatus:null}
 const stderrRecord=commandFailure?empty:primaryCliRecord(stderr),stdoutRecord=commandFailure?empty:primaryCliRecord(stdout)
 const record=stderrRecord.sqlstate?stderrRecord:stdoutRecord.sqlstate?stdoutRecord:stderrRecord.structured?stderrRecord:stdoutRecord.structured?stdoutRecord:stderrRecord.primary?stderrRecord:stdoutRecord
 const sqlstate=record.sqlstate
 const classifier=maskQuotedValues(record.primary||'')
 const category=sqlstate?'PG_'+sqlstate:/unknown flag|unknown command|Usage:/i.test(classifier)?'CLI_INTERFACE':/access token|unauthori[sz]ed|authentication|401|403/i.test(classifier)?'AUTH_REJECTED':/project ref|link|config/i.test(classifier)?'LINK_CONFIG':/connect|network|dial|TLS|certificate|timeout/i.test(classifier)?'CONNECTION':'COMMAND'
 const guard=/^((?:WORKFLOW_REHEARSAL|AZURE_FIXTURE)_[A-Z_0-9]+)\b/.exec(record.primaryMessage||'')?.[1]
 const messageCode=safeGuardMessages.includes(guard)?guard:null
 const tap=messageCode==='WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE'?/WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE assertion=([1-9][0-9]{0,3}) sqlstate=([0-9A-Z]{5}|unknown)(?:\s|$)/.exec(record.primary||''):null
 const firstTapFailure=tap&&Number(tap[1])<=maximumTapAssertion?Object.freeze({assertion:Number(tap[1]),sqlstate:tap[2]==='unknown'?null:tap[2]}):null
 const match=/^(?:CONTEXT:\s*)?PL\/pgSQL function ([^\r\n]{1,200}?) line ([0-9]{1,6}) at (RAISE|SQL statement|RETURN|assignment|IF|PERFORM)\b/.exec(record.context||'')
 const location=match?Object.freeze({kind:'plpgsql',...(match[1]==='inline_code_block'?{function:'inline_code_block'}:{functionSha256:workflowSha(match[1])}),line:Number(match[2]),operation:match[3]}):null
 // Primary wording is bounded/redacted; raw streams remain fingerprints only.
 const sanitizedSummary=[category,messageCode,location?'line '+location.line+' at '+location.operation:null].filter(Boolean).join('; ')
 const stream=value=>Object.freeze({bytes:Buffer.byteLength(value),sha256:workflowSha(value),sanitizedSummary})
 const diagnostic=Object.freeze({schemaVersion:2,kind:'native-cli-primary',category,sqlstate,messageCode,location,firstTapFailure,...retainedPrimary(commandFailureMessages[commandFailure]||record.primaryMessage||'Native command failed without primary message'),commandFailure,httpStatus:record.httpStatus,streamsComplete,exitCode:Number.isInteger(status)?status:null,sqlSha256:/^[a-f0-9]{64}$/.test(sqlSha256)?sqlSha256:null,stdout:stream(stdout),stderr:stream(stderr)})
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
export function createWorkflowQuery({linkRoot=workflowLinkedRoot,linkedMetadata=readWorkflowLinkMetadata(linkRoot),env,binary,spawnProcess=spawn,assertHeld=()=>{},maximumTapAssertion=80}){
 if(![80,124].includes(maximumTapAssertion))throw Error('WORKFLOW_REHEARSAL_DIAGNOSTIC_INVALID')
 return async function query(sql,{timeoutMs=workflowQueryLimits.controlMs}={}){
  const directory=mkdtempSync(join(tmpdir(),'taskovia-cost-workflow-query-'))
  const file=join(directory,'query.sql')
  let capturedOut=Buffer.alloc(0),capturedErr=Buffer.alloc(0),capturedStatus=null,primaryFailure,result
  const commandError=(code,complete=false)=>{const error=workflowCliFailure({stdout:capturedOut,stderr:capturedErr,status:capturedStatus,sqlSha256:workflowSha(sql),maximumTapAssertion,commandFailure:code,streamsComplete:complete});return workflowWrapCliFailure(code,error)}
  try{
  if(!sql.startsWith('/*c1cw-')&&!/^begin\b/i.test(sql.trim()))sql="begin read only;set local statement_timeout='10s';set local transaction_timeout='15s';"+sql+"rollback;"
  const allowance=[workflowSnapshotOutputAllowance,workflowSnapshotPairOutputAllowance].find(value=>value.sqlSha256===workflowSha(sql))
   const outputBytes=allowance?.outputBytes??workflowQueryLimits.outputBytes
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
     capturedOut=Buffer.concat(stdout);capturedErr=Buffer.concat(stderr);capturedStatus=status
     if(failed)return reject(commandError(failureCode))
     let output,errorText
     try{
      // Decode complete bounded byte sequences once. Chunk boundaries must not
      // replace split Unicode characters or conceal truncated UTF-8.
      const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true})
      output=decoder.decode(Buffer.concat(stdout));errorText=decoder.decode(Buffer.concat(stderr))
     }catch{return reject(commandError('WORKFLOW_REHEARSAL_RESULT_INVALID',true))}
     if(status!==0){
      return reject(workflowCliFailure({stdout:output,stderr:errorText,status,sqlSha256:workflowSha(sql),maximumTapAssertion}))
     }
     try{resolve(JSON.parse(output))}catch{reject(commandError('WORKFLOW_REHEARSAL_RESULT_INVALID',true))}
    })
   }).catch(error=>{if(workflowCliDiagnostic(error))throw error;throw commandError('WORKFLOW_REHEARSAL_CLI_UNAVAILABLE')})
   // CLI 2.114.0 emits row arrays; keep the existing mocked envelope contract.
   const rows=Array.isArray(response)?response:response?.rows
   if(!Array.isArray(rows))throw commandError('WORKFLOW_REHEARSAL_RESULT_INVALID',true)
   result=Array.isArray(response)?{rows}:response
  }catch(error){primaryFailure=error}finally{
   let finalizationFailure
   try{assertHeld();assertWorkflowLinkUnchanged(linkRoot,linkedMetadata)}catch(error){finalizationFailure=error}
   try{rmSync(directory,{recursive:true,force:true})}catch{finalizationFailure ||=new Error('WORKFLOW_REHEARSAL_QUERY_CLEANUP_FAILED')}
   if(finalizationFailure)primaryFailure=workflowWrapCliFailure(finalizationFailure.message,primaryFailure)
  }
  if(primaryFailure)throw primaryFailure
  return result
 }
}
