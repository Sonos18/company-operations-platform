import {workflowSha} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {workflowSnapshotSql} from './c1-cost-workflow-rehearsal-catalog.mjs'
import {workflowQueryLimits} from './c1-cost-workflow-rehearsal-transport.mjs'
export const workflowApiProject='gtgljlnhwvhqdnwrfdfj'
export const workflowApiTransportReview=Object.freeze({
 status:'blocked',tool:'mcp__codex_apps__supabase_execute_sql',projectId:workflowApiProject,
 credentials:'existing connected app only; no credential read, copy or provisioning',
 blockers:Object.freeze([
  'No caller deadline/cancellation handle in the connected tool schema.',
  'Bounded provider settlement and no automatic replay have not been verified.',
  'Single-session batch execution, exact query prefix and independent cleanup availability have not been verified.',
  'Streaming enforcement of the existing four MiB output ceiling is not exposed.',
  'execute_sql directs DDL to apply_migration; persistent migration apply is outside rollback-only rehearsal.',
 ]),
})
export function assertWorkflowApiReady(){
 if(workflowApiTransportReview.status!=='verified')throw new Error('WORKFLOW_REHEARSAL_API_CAPABILITIES_UNVERIFIED')
}
// Preserve the exact original catalogue union and aggregate hash. Retain every
// object's metadata; replace function text with its exact digest and omit the
// inaccessible pg_roles password placeholder from the exported metadata only.
const aggregate="select string_agg(value,E'\\n' order by value) into metadata from("
const replacement=String.raw`select string_agg(value,E'\n' order by value),
 jsonb_agg(jsonb_build_object(
  'kind',kind,
  'identity',coalesce(payload->>'oid',case kind
   when 'attribute' then (payload->>'attrelid')||':'||(payload->>'attnum')
   when 'index' then payload->>'indexrelid'
   when 'sequence' then payload->>'seqrelid'
   when 'dependency' then concat_ws(':',payload->>'classid',payload->>'objid',payload->>'objsubid',payload->>'refclassid',payload->>'refobjid',payload->>'refobjsubid',payload->>'deptype')
   when 'role_membership' then concat_ws(':',payload->>'roleid',payload->>'member',payload->>'grantor')
   end),
  'sha256',encode(sha256(convert_to(value,'UTF8')),'hex'),
  'metadata',(payload-'prosrc'-'rolpassword')||
   case when payload ? 'prosrc' then jsonb_build_object('prosrcSha256',encode(sha256(convert_to(payload->>'prosrc','UTF8')),'hex')) else '{}'::jsonb end
 ) order by value),count(*),encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(value,'UTF8')),'hex'),E'\n' order by value),''),'UTF8')),'hex') into metadata,objects,object_count,object_hashes from(
 select value,split_part(value,':',1) kind,substring(value from position(':' in value)+1)::jsonb payload from(`
if(!workflowSnapshotSql.includes(aggregate)||!workflowSnapshotSql.includes(') catalogue;'))throw new Error('WORKFLOW_REHEARSAL_API_SNAPSHOT_SOURCE')
export const workflowApiSnapshotSql=workflowSnapshotSql
 .replace('f jsonb; metadata text;','f jsonb; metadata text; objects jsonb; object_count bigint; object_hashes text;')
 .replace(aggregate,replacement)
 .replace(') catalogue;',') catalogue_values\n) catalogue;')
 .replace("'tables',tables,'sequences',sequences,'catalogueSha256'","'tables',tables,'sequences',sequences,'catalogueObjectCount',object_count,'catalogueObjectHashesSha256',object_hashes,'catalogueObjects',objects,'catalogueSha256'")
export function workflowApiObjectIdentity(kind,payload){
 if(payload?.oid!==undefined&&payload.oid!==null)return String(payload.oid)
 const fields={
  attribute:['attrelid','attnum'],index:['indexrelid'],sequence:['seqrelid'],
  dependency:['classid','objid','objsubid','refclassid','refobjid','refobjsubid','deptype'],
  role_membership:['roleid','member','grantor'],
 }[kind]
 if(!fields||fields.some(name=>payload?.[name]===undefined||payload[name]===null))throw new Error('WORKFLOW_REHEARSAL_API_SNAPSHOT_INVALID')
 return fields.map(name=>String(payload[name])).join(':')
}
export function assertWorkflowApiSnapshot(row){
 const snapshot=row?.snapshot,objects=snapshot?.catalogueObjects,keys=new Set()
 if(!snapshot||!snapshot.tables||!snapshot.sequences||!/^[a-f0-9]{64}$/.test(snapshot.catalogueSha256)||!Array.isArray(objects)||!objects.length||!Number.isSafeInteger(snapshot.catalogueObjectCount)||snapshot.catalogueObjectCount!==objects.length||!/^[a-f0-9]{64}$/.test(snapshot.catalogueObjectHashesSha256)||!Number.isFinite(Date.parse(row.server_time))||typeof row.database!=='string'||typeof row.username!=='string')throw new Error('WORKFLOW_REHEARSAL_API_SNAPSHOT_INVALID')
 for(const object of objects){
  if(!object||typeof object.kind!=='string'||!object.kind||typeof object.identity!=='string'||!object.identity||!/^[a-f0-9]{64}$/.test(object.sha256)||!object.metadata||typeof object.metadata!=='object'||Array.isArray(object.metadata)||'prosrc' in object.metadata||'rolpassword' in object.metadata)throw new Error('WORKFLOW_REHEARSAL_API_SNAPSHOT_INVALID')
  // pg_depend can contain repeated complete seven-field rows. Keep every row
  // and its hash-list occurrence; only other catalogue identities are unique.
  const key=object.kind+':'+object.identity
  if(object.identity!==workflowApiObjectIdentity(object.kind,object.metadata)||(object.kind!=='dependency'&&keys.has(key)))throw new Error('WORKFLOW_REHEARSAL_API_SNAPSHOT_INVALID')
  keys.add(key)
  if(object.kind==='role'&&!Object.hasOwn(object.metadata,'rolvaliduntil'))throw new Error('WORKFLOW_REHEARSAL_API_SNAPSHOT_INVALID')
  if(object.kind==='function'&&!/^[a-f0-9]{64}$/.test(object.metadata.prosrcSha256))throw new Error('WORKFLOW_REHEARSAL_API_SNAPSHOT_INVALID')
 }
 if(workflowSha(objects.map(object=>object.sha256).join('\n'))!==snapshot.catalogueObjectHashesSha256)throw new Error('WORKFLOW_REHEARSAL_API_SNAPSHOT_INVALID')
 return row
}
export function workflowApiRows(result){
 const serialized=JSON.stringify(result)
 if(typeof serialized!=='string')throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
 if(Buffer.byteLength(serialized,'utf8')>workflowQueryLimits.outputBytes)throw new Error('WORKFLOW_REHEARSAL_OUTPUT_LIMIT')
 if(result?.isError===true){
  const state=/SQLSTATE\s+([0-9A-Z]{5})\b/.exec(serialized)?.[1]
  throw new Error('WORKFLOW_REHEARSAL_EXECUTION_FAILED:'+(state?'PG_'+state:'API'))
 }
 if(!Array.isArray(result?.content)||result.content.length!==1||result.content[0]?.type!=='text')throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
 let wrapped,rows
 try{wrapped=JSON.parse(result.content[0].text)}catch{throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')}
 if(typeof wrapped?.result!=='string')throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
 const matches=[...wrapped.result.matchAll(/\n<untrusted-data-([a-zA-Z0-9-]+)>\n([\s\S]*?)\n<\/untrusted-data-\1>(?=\n|$)/g)]
 if(matches.length!==1)throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
 try{rows=JSON.parse(matches[0][2])}catch{throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')}
 if(!Array.isArray(rows)||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
 return {rows}
}
// Inject the existing connected executor, never auth/env/fetch/CLI fallback.
// Diagnostic reads only: owned rollback-DDL batches fail before app dispatch.
export function createWorkflowApiQuery({projectId=workflowApiProject,executeSql,assertHeld=()=>{}}={}){
 if(projectId!==workflowApiProject)throw new Error('WORKFLOW_REHEARSAL_API_TARGET')
 if(typeof executeSql!=='function')throw new Error('WORKFLOW_REHEARSAL_API_EXECUTOR_REQUIRED')
 let uncertain=false,inFlight=false
 return async function query(sql,{timeoutMs=workflowQueryLimits.controlMs}={}){
  assertHeld()
  if(uncertain)throw new Error('WORKFLOW_REHEARSAL_API_CHANNEL_UNCERTAIN')
  if(inFlight)throw new Error('WORKFLOW_REHEARSAL_API_CHANNEL_BUSY')
  if(typeof sql!=='string'||!sql.trim())throw new Error('WORKFLOW_REHEARSAL_API_QUERY_INVALID')
  const batch=/^\s*\/\*c1cw-/.test(sql)
  if(batch)assertWorkflowApiReady()
  const snapshot=sql===workflowSnapshotSql||sql===workflowApiSnapshotSql
  if(!batch&&!snapshot&&!['select 1;','select true as safe;'].includes(sql))throw new Error('WORKFLOW_REHEARSAL_API_QUERY_UNREVIEWED')
  if(!Number.isInteger(timeoutMs)||timeoutMs<=0||timeoutMs>(batch?workflowQueryLimits.batchMs:workflowQueryLimits.controlMs))throw new Error('WORKFLOW_REHEARSAL_API_TIMEOUT_INVALID')
  if(snapshot)sql=workflowApiSnapshotSql
  if(!batch&&!/^\s*begin(?:\s+isolation\s+level\s+repeatable\s+read)?\s+read\s+only\s*;/i.test(sql))sql="begin read only;set local statement_timeout='10s';set local transaction_timeout='15s';"+sql+'rollback;'
  let timer,dispatched=false
  inFlight=true
  try{
   const pending=Promise.resolve().then(()=>{assertHeld();dispatched=true;return executeSql({project_id:workflowApiProject,query:sql})})
   const expiry=new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('WORKFLOW_REHEARSAL_CLIENT_TIMEOUT')),timeoutMs)})
   const response=workflowApiRows(await Promise.race([pending,expiry]))
   assertHeld()
   if(snapshot){if(response.rows.length!==1)throw new Error('WORKFLOW_REHEARSAL_API_SNAPSHOT_INVALID');assertWorkflowApiSnapshot(response.rows[0])}
   return response
  }catch(error){
   if(dispatched)uncertain=true
   if(/^WORKFLOW_REHEARSAL_[A-Z_]+(?::[A-Z_0-9]+)?$/.test(error?.message))throw error
   // eslint-disable-next-line preserve-caught-error -- Raw provider causes may expose private SQL or credentials.
   throw new Error('WORKFLOW_REHEARSAL_EXECUTION_FAILED:API')
  }finally{clearTimeout(timer);inFlight=false}
 }
}
