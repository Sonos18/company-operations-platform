import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {workflowApiSnapshotSql,assertWorkflowApiSnapshot} from './c1-cost-workflow-rehearsal-api.mjs'
import {workflowSha} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {assertWorkflowPostflight,sequenceAllocations,workflowSequenceNames,workflowCumulativeBudgets} from './c1-cost-workflow-rehearsal-catalog.mjs'
export const workflowNativeExpiryPolicy=Object.freeze({projectRef:'gtgljlnhwvhqdnwrfdfj',roleOid:'17487',roleName:'cli_login_postgres',field:'rolvaliduntil',monotonic:true,maxObservedFutureSeconds:300,manualAlterRole:false,otherCatalogueExceptions:false})
const anchor=' into metadata,objects,object_count,object_hashes from('
if(!workflowApiSnapshotSql.includes(anchor))throw new Error('WORKFLOW_REHEARSAL_NATIVE_SNAPSHOT_SOURCE')
// Reuse only the full READ ONLY snapshot builder and validator. The experimental
// API executor remains blocked. Preserve the original aggregate and object hashes.
const roleValue="case when kind='role' and payload->>'oid'='17487' and payload->>'rolname'='cli_login_postgres' then 'role:'||(payload-'rolvaliduntil')::text else value end"
export const workflowNativeSnapshotSql=workflowApiSnapshotSql
 .replace('object_hashes text;','object_hashes text; comparable_hash text;')
 .replace(anchor,",encode(sha256(convert_to(coalesce(string_agg("+roleValue+",E'\\n' order by "+roleValue+"),''),'UTF8')),'hex') into metadata,objects,object_count,object_hashes,comparable_hash from(")
 .replace("'catalogueSha256',encode","'catalogueComparableSha256',comparable_hash,'catalogueSha256',encode")
 // Preserve the entire JSON value; prevent the native CLI from expanding nested fields.
 .replace("::jsonb as snapshot,","::jsonb::text as snapshot,")
function microseconds(value){
 if(typeof value!=='string')throw new Error('WORKFLOW_REHEARSAL_CLI_EXPIRY_INVALID')
 const m=/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(value)
 if(!m)throw new Error('WORKFLOW_REHEARSAL_CLI_EXPIRY_INVALID')
 const zone=/^[+-]\d{2}$/.test(m[3])?m[3]+':00':m[3]
 const milliseconds=Date.parse(m[1].replace(' ','T')+zone)
 if(!Number.isFinite(milliseconds))throw new Error('WORKFLOW_REHEARSAL_CLI_EXPIRY_INVALID')
 return BigInt(milliseconds)*1000n+BigInt((m[2]||'').padEnd(6,'0'))
}
export function assertWorkflowNativeSnapshot(row){
 assertWorkflowApiSnapshot(row)
 if(!/^[a-f0-9]{64}$/.test(row.snapshot.catalogueComparableSha256))throw new Error('WORKFLOW_REHEARSAL_SNAPSHOT_INVALID')
 const matches=row.snapshot.catalogueObjects.filter(o=>o.kind==='role'&&(o.identity==='17487'||o.metadata.rolname==='cli_login_postgres'))
 if(matches.length!==1||matches[0].identity!=='17487'||String(matches[0].metadata.oid)!=='17487'||matches[0].metadata.rolname!=='cli_login_postgres')throw new Error('WORKFLOW_REHEARSAL_CLI_ROLE_CHANGED')
 const expiry=microseconds(matches[0].metadata.rolvaliduntil),now=microseconds(row.server_time)
 if(expiry>now+300000000n)throw new Error('WORKFLOW_REHEARSAL_CLI_EXPIRY_BOUND')
 return row
}
export function assertWorkflowNativeCatalogue(before,after){
 assertWorkflowNativeSnapshot(before);assertWorkflowNativeSnapshot(after)
 const a=before.snapshot,b=after.snapshot
 if(a.catalogueComparableSha256!==b.catalogueComparableSha256)throw new Error('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT')
 // Sort complete exported rows, retaining every duplicate occurrence. This
 // compares a deterministic multiset without pruning or identity-key overwrite.
 const rows=snapshot=>snapshot.catalogueObjects.filter(o=>!(o.kind==='role'&&o.identity==='17487')).map(o=>JSON.stringify(o)).sort()
 if(a.catalogueObjectCount!==b.catalogueObjectCount||JSON.stringify(rows(a))!==JSON.stringify(rows(b)))throw new Error('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT')
 const object=a.catalogueObjects.find(o=>o.kind==='role'&&o.identity==='17487')
 const other=b.catalogueObjects.find(o=>o.kind==='role'&&o.identity==='17487')
 const {rolvaliduntil:oldExpiry,...oldMetadata}=object.metadata
 const {rolvaliduntil:newExpiry,...newMetadata}=other.metadata
 if(JSON.stringify(oldMetadata)!==JSON.stringify(newMetadata))throw new Error('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT')
 if(microseconds(newExpiry)<microseconds(oldExpiry))throw new Error('WORKFLOW_REHEARSAL_CLI_EXPIRY_REGRESSED')
 let expiryChange=null
 if(oldExpiry!==newExpiry){
  if(object.sha256===other.sha256||a.catalogueSha256===b.catalogueSha256)throw new Error('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT')
  expiryChange={roleOid:'17487',roleName:'cli_login_postgres',field:'rolvaliduntil',before:oldExpiry,after:newExpiry}
 }else if(object.sha256!==other.sha256)throw new Error('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT')
 if(!expiryChange&&a.catalogueSha256!==b.catalogueSha256)throw new Error('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT')
 return expiryChange
}
export function assertWorkflowNativePostflight(before,after,index,cumulative=[0n,0n]){
 const expiryChange=assertWorkflowNativeCatalogue(before,after)
 if(index==='total'){
  if(JSON.stringify(before.snapshot.tables)!==JSON.stringify(after.snapshot.tables)||JSON.stringify(Object.keys(before.snapshot.sequences).sort())!==JSON.stringify(Object.keys(after.snapshot.sequences).sort()))throw new Error('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT')
  const allocations=workflowSequenceNames.map(name=>sequenceAllocations(before.snapshot.sequences[name],after.snapshot.sequences[name]))
  if(allocations.some((n,i)=>n>BigInt(workflowCumulativeBudgets[i])))throw new Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
  for(const name of Object.keys(before.snapshot.sequences))if(!workflowSequenceNames.includes(name)&&JSON.stringify(before.snapshot.sequences[name])!==JSON.stringify(after.snapshot.sequences[name]))throw new Error('WORKFLOW_REHEARSAL_UNAPPROVED_SEQUENCE_CHANGE')
  return {allocations,expiryChange}
 }
 const result=assertWorkflowPostflight(
 {...before.snapshot,catalogueSha256:before.snapshot.catalogueComparableSha256},
 {...after.snapshot,catalogueSha256:after.snapshot.catalogueComparableSha256},index,cumulative)
 return {...result,snapshotSha256:workflowSha(JSON.stringify(after.snapshot)),expiryChange}
}
export function workflowNativeBaseline(manifestSha256,row){
 assertWorkflowNativeSnapshot(row)
 if(!/^[a-f0-9]{64}$/.test(manifestSha256))throw new Error('WORKFLOW_REHEARSAL_BASELINE_INVALID')
 const packet={schemaVersion:1,projectRef:'gtgljlnhwvhqdnwrfdfj',manifestSha256,row,newBaseline:true,historicalRestorationClaim:false}
 return {...packet,sha256:workflowSha(JSON.stringify(packet))}
}
export function assertWorkflowNativeBaseline(baseline,manifestSha256,confirmation){
 if(!baseline||baseline.manifestSha256!==manifestSha256||confirmation!==baseline.sha256)throw new Error('WORKFLOW_REHEARSAL_BASELINE_REQUIRED')
 const expected=workflowNativeBaseline(manifestSha256,baseline.row)
 if(JSON.stringify(expected)!==JSON.stringify(baseline))throw new Error('WORKFLOW_REHEARSAL_BASELINE_INVALID')
 return baseline
}

export function reserveWorkflowNativeRetry(directory,manifestSha256,baselineSha256,runId){
 if(!/^[a-f0-9]{64}$/.test(manifestSha256)||!/^[a-f0-9]{64}$/.test(baselineSha256))throw new Error('WORKFLOW_REHEARSAL_AUTHORIZATION_REQUIRED')
 mkdirSync(directory,{recursive:true})
 try{
  writeFileSync(resolve(directory,'native-retry-'+manifestSha256+'.started.json'),JSON.stringify({manifestSha256,baselineSha256,runId,startedAt:new Date().toISOString()}),{mode:0o600,flag:'wx'})
 }catch(error){
  if(error?.code==='EEXIST')throw new Error('WORKFLOW_REHEARSAL_RETRY_ALREADY_CONSUMED',{cause:error})
  throw error
 }
}

const collectionStart=workflowNativeSnapshotSql.indexOf('do $workflow_snapshot$')
const collectionEnd=workflowNativeSnapshotSql.indexOf('end;$workflow_snapshot$;',collectionStart)
if(collectionStart<0||collectionEnd<0)throw new Error('WORKFLOW_REHEARSAL_ADMISSION_STATE_SOURCE')
export const workflowNativeStateCollectionSql=workflowNativeSnapshotSql.slice(collectionStart,collectionEnd+'end;$workflow_snapshot$;'.length)
export const workflowAdmissionClockSql='/*workflow_admission_clock*/select clock_timestamp()::text as server_time,current_database() as database,session_user as username;'
export const workflowNativeAdmissionPolicy=Object.freeze({freshClockAfterPreparation:true,stateCheck:'same repeatable-read transaction before fixture DDL',originalSnapshotRetained:true,windowSeconds:10,transactionSeconds:150,globalConcurrencyLock:false})
export function workflowNativeAdmissionClock(response,before){
 const row=response?.rows?.length===1?response.rows[0]:null
 if(!row||row.database!==before.database||row.username!==before.username||typeof row.server_time!=='string')throw new Error('WORKFLOW_REHEARSAL_ADMISSION_CLOCK')
 try{if(microseconds(row.server_time)<microseconds(before.server_time))throw new Error('WORKFLOW_REHEARSAL_ADMISSION_CLOCK')}catch{throw new Error('WORKFLOW_REHEARSAL_ADMISSION_CLOCK')}
 return {serverTime:row.server_time,database:row.database,username:row.username}
}
export function workflowNativeAdmissionStateSql(before){
 assertWorkflowNativeSnapshot(before)
 const state=before.snapshot,cli=state.catalogueObjects.find(o=>o.kind==='role'&&o.identity==='17487')
 const expected={tables:state.tables,sequences:state.sequences,catalogueSha256:state.catalogueSha256,catalogueComparableSha256:state.catalogueComparableSha256,catalogueObjectCount:state.catalogueObjectCount,nonRoleObjectHashesSha256:workflowSha(state.catalogueObjects.filter(o=>!(o.kind==='role'&&o.identity==='17487')).map(o=>o.sha256).join('\n')),cliMetadata:cli.metadata,cliExpiry:cli.metadata.rolvaliduntil}
 const literal="'"+JSON.stringify(expected).replaceAll("'","''")+"'"
 return "set local row_security=off;\nset local search_path=pg_catalog,public,extensions;\n"+workflowNativeStateCollectionSql+`
do $workflow_state_admission$
declare
 state jsonb=pg_catalog.current_setting('taskovia.workflow_snapshot_result')::jsonb;
 expected jsonb=${literal}::jsonb;
 cli jsonb;cli_count bigint;all_hashes text;non_role_hashes text;old_expiry timestamptz;new_expiry timestamptz;
begin
 if state->'tables' is distinct from expected->'tables' or state->'sequences' is distinct from expected->'sequences'
  or state->>'catalogueComparableSha256' is distinct from expected->>'catalogueComparableSha256'
  or state->'catalogueObjectCount' is distinct from expected->'catalogueObjectCount'
  or (state->>'catalogueObjectCount')::bigint<>jsonb_array_length(state->'catalogueObjects')
 then raise exception 'WORKFLOW_REHEARSAL_ADMISSION_STATE_CHANGED';end if;
 select encode(sha256(convert_to(coalesce(string_agg(e.value->>'sha256',E'\n' order by e.ordinality),''),'UTF8')),'hex'),
  encode(sha256(convert_to(coalesce(string_agg(e.value->>'sha256',E'\n' order by e.ordinality) filter(where not(e.value->>'kind'='role' and e.value->>'identity'='17487')),''),'UTF8')),'hex')
 into all_hashes,non_role_hashes from jsonb_array_elements(state->'catalogueObjects') with ordinality e(value,ordinality);
 if all_hashes is distinct from state->>'catalogueObjectHashesSha256' or non_role_hashes is distinct from expected->>'nonRoleObjectHashesSha256'
 then raise exception 'WORKFLOW_REHEARSAL_ADMISSION_STATE_CHANGED';end if;
 select count(*),jsonb_agg(e.value)->0 into cli_count,cli from jsonb_array_elements(state->'catalogueObjects') e(value)
 where e.value->>'kind'='role' and (e.value->>'identity'='17487' or e.value->'metadata'->>'rolname'='cli_login_postgres');
 if cli_count<>1 or cli->>'identity'<>'17487' or cli->'metadata'->>'oid'<>'17487' or cli->'metadata'->>'rolname'<>'cli_login_postgres'
  or (cli->'metadata')-'rolvaliduntil'::text is distinct from (expected->'cliMetadata')-'rolvaliduntil'::text
  or jsonb_typeof(cli->'metadata'->'rolvaliduntil') is distinct from 'string'
 then raise exception 'WORKFLOW_REHEARSAL_ADMISSION_STATE_CHANGED';end if;
 old_expiry=(expected->>'cliExpiry')::timestamptz;new_expiry=(cli->'metadata'->>'rolvaliduntil')::timestamptz;
 if not isfinite(new_expiry) or new_expiry<old_expiry or new_expiry>clock_timestamp()+interval '300 seconds'
 then raise exception 'WORKFLOW_REHEARSAL_CLI_EXPIRY_BOUND';end if;
 if (cli->'metadata'->>'rolvaliduntil'=expected->>'cliExpiry' and state->>'catalogueSha256' is distinct from expected->>'catalogueSha256')
  or (cli->'metadata'->>'rolvaliduntil'<>expected->>'cliExpiry' and state->>'catalogueSha256'=expected->>'catalogueSha256')
 then raise exception 'WORKFLOW_REHEARSAL_ADMISSION_STATE_CHANGED';end if;
end;$workflow_state_admission$;
`
}
