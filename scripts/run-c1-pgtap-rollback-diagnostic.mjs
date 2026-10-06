import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {assertCloudDevTarget} from './assert-cloud-dev-target.mjs'
import {isolatedSupabaseEnvironment} from './run-supabase-dev.mjs'
import {workflowLinkedRoot,readWorkflowLinkMetadata,assertWorkflowLinkUnchanged} from './c1-cost-workflow-rehearsal-link.mjs'
import {workflowSha,workflowExecutionInventory,workflowSourceRoot} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {workflowNativeSnapshotSql,assertWorkflowNativeSnapshot,assertWorkflowNativeCatalogue,workflowNativeAdmissionStateSql,workflowNativeStateCollectionSql,workflowAdmissionClockSql,workflowNativeAdmissionClock,workflowNativeExpiryPolicy} from './c1-cost-workflow-rehearsal-native.mjs'
import {workflowAdmissionSql,workflowTimeouts} from './c1-cost-workflow-rehearsal-catalog.mjs'
import {workflowManagedDdlGuardSql,workflowManagedDdlHandlers} from './c1-cost-workflow-rehearsal-managed-ddl.mjs'
import {workflowPgTapSetup,workflowPgTapSetupSql,workflowPgTapGuardSql,workflowPgTapMetadataSql,workflowPgTapExpectedMetadata,workflowPgTapOwnerPolicy,assertWorkflowPgTapInstalledMetadata} from './c1-cost-workflow-rehearsal-pgtap.mjs'
import {createWorkflowQuery,acquireWorkflowValidationLock,workflowQueryLimits,workflowSnapshotOutputAllowance,workflowCliDiagnostic,workflowWrapCliFailure} from './c1-cost-workflow-rehearsal-transport.mjs'
import {closeOwnedWorkflowBackend} from './run-c1-cost-workflow-rehearsal.mjs'

const artifactDirectory='.superpowers/sdd/2026-10-04-document-backed-installment-approval'
export const pgTapDiagnosticAnchorFile=artifactDirectory+'/native-4e86b2c7-f7ad-4636-83fd-d08fd966dc07-snapshot-2.json'
const expectedMetadata=workflowPgTapExpectedMetadata
const loggingGuard="if current_setting('log_min_messages') not in ('debug5','debug4','debug3','debug2','debug1','info','notice','warning') then raise exception 'WORKFLOW_REHEARSAL_PGTAP_DIAGNOSTIC_LOGGING';end if;"
export const pgTapDiagnosticPreflightSql="do $workflow_pgtap_preflight$ begin\n"+workflowManagedDdlGuardSql+workflowPgTapGuardSql('available')+"\n"+loggingGuard+"\nend;$workflow_pgtap_preflight$;\n"
export const pgTapDiagnosticPayloadSql=pgTapDiagnosticPreflightSql+workflowPgTapSetupSql+"\nselect "+workflowPgTapMetadataSql+"::text as metadata,'WORKFLOW_PGTAP_DIAGNOSTIC_GUARD_ACCEPTED' as result;\n"
const parse=value=>typeof value==='string'?JSON.parse(value):value

const allSequenceCollectionSql=String.raw`
do $workflow_pgtap_all_sequences$
declare r record;state jsonb='{}';value jsonb;
begin
 for r in select c.oid,c.relname,c.relpersistence,c.relowner,c.relacl,n.oid namespace_oid,n.nspname,s.*
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 join pg_catalog.pg_sequence s on s.seqrelid=c.oid order by c.oid
 loop
  execute format('select jsonb_build_object(''lastValue'',last_value::text,''isCalled'',is_called) from %I.%I',r.nspname,r.relname) into value;
  state=state||jsonb_build_object(r.oid::text,value||jsonb_build_object('oid',r.oid::text,'schemaOid',r.namespace_oid::text,'schema',r.nspname,'name',r.relname,'ownerOid',r.relowner::text,'persistence',r.relpersistence,'aclSha256',encode(sha256(convert_to(coalesce(r.relacl::text,'NULL'),'UTF8')),'hex'),'typeOid',r.seqtypid::text,'start',r.seqstart::text,'increment',r.seqincrement::text,'min',r.seqmin::text,'max',r.seqmax::text,'cache',r.seqcache::text,'cycle',r.seqcycle));
 end loop;
 perform pg_catalog.set_config('taskovia.pgtap_all_sequences',state::text,true);
end;$workflow_pgtap_all_sequences$;
`
export const pgTapDiagnosticAllSequenceSql="begin isolation level repeatable read read only;\nset local transaction_timeout='15s';set local statement_timeout='15s';set local lock_timeout='5s';set local idle_in_transaction_session_timeout='5s';\n"+allSequenceCollectionSql+"select current_setting('taskovia.pgtap_all_sequences') as sequences,clock_timestamp()::text as server_time,current_database() as database,session_user as username;\nrollback;"
export function parsePgTapAllSequences(response){
 let row,state
 try{
  if(response?.rows?.length!==1)throw Error()
  row=response.rows[0];state=parse(row.sequences)
  if(row.database!=='postgres'||row.username!=='postgres'||typeof row.server_time!=='string'||!Number.isFinite(Date.parse(row.server_time))||!state||typeof state!=='object'||Array.isArray(state))throw Error()
  const fields=['oid','schemaOid','schema','name','ownerOid','persistence','aclSha256','typeOid','start','increment','min','max','cache','cycle','lastValue','isCalled']
  for(const [key,value] of Object.entries(state)){
   if(!oid(key)||!keys(value,fields)||value.oid!==key||!['schemaOid','ownerOid','typeOid'].every(k=>oid(value[k])))throw Error()
   if(!['schema','name'].every(k=>typeof value[k]==='string'&&value[k].length>0&&Buffer.byteLength(value[k],'utf8')<=63)||!['p','u','t'].includes(value.persistence)||! /^[a-f0-9]{64}$/.test(value.aclSha256))throw Error()
   if(!['start','increment','min','max','cache','lastValue'].every(k=>typeof value[k]==='string'&&/^-?[0-9]{1,20}$/.test(value[k])&&BigInt(value[k])>=-9223372036854775808n&&BigInt(value[k])<=9223372036854775807n)||typeof value.cycle!=='boolean'||typeof value.isCalled!=='boolean')throw Error()
  }
 }catch{throw new Error('WORKFLOW_REHEARSAL_PGTAP_ALL_SEQUENCE_INVALID')}
 return {...row,sequences:state}
}
export function assertPgTapAllSequences(before,after){
 if(before.database!==after.database||before.username!==after.username||Date.parse(after.server_time)<Date.parse(before.server_time)||!isDeepStrictEqual(before.sequences,after.sequences))throw new Error('WORKFLOW_REHEARSAL_PGTAP_ALL_SEQUENCE_CHANGED')
 return {everySequenceUnchanged:true,allSequenceCount:Object.keys(after.sequences).length,allSequenceSha256:workflowSha(JSON.stringify(after.sequences)),sequenceAllocationsAllowed:0}
}
function assertCoveredSequences(full,all){
 for(const [name,value] of Object.entries(full.snapshot.sequences)){
  const matches=Object.values(all.sequences).filter(sequence=>sequence.schema+'.'+sequence.name===name)
  if(matches.length!==1||!Object.entries(value).every(([key,v])=>isDeepStrictEqual(matches[0][key],v)))throw new Error('WORKFLOW_REHEARSAL_PGTAP_ALL_SEQUENCE_CHANGED')
 }
}
function allSequenceAdmissionSql(before){
 const literal="'"+JSON.stringify(before.sequences).replaceAll("'","''")+"'"
 return allSequenceCollectionSql+"do $workflow_pgtap_sequence_admission$ begin if pg_catalog.current_setting('taskovia.pgtap_all_sequences')::jsonb is distinct from "+literal+"::jsonb then raise exception 'WORKFLOW_REHEARSAL_PGTAP_ALL_SEQUENCE_CHANGED';end if;end;$workflow_pgtap_sequence_admission$;\n"
}

function readAnchor(cwd){const row=JSON.parse(readFileSync(resolve(cwd,pgTapDiagnosticAnchorFile),'utf8'));row.snapshot=parse(row.snapshot);assertWorkflowNativeSnapshot(row);return row}
function responseSnapshot(response){let row;try{if(response?.rows?.length!==1)throw Error();row={...response.rows[0],snapshot:parse(response.rows[0].snapshot)}}catch{throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')}assertWorkflowNativeSnapshot(row);return row}
export function assertPgTapDiagnosticState(before,after){
 const expiryChange=assertWorkflowNativeCatalogue(before,after)
 if(before.database!==after.database||before.username!==after.username||!isDeepStrictEqual(before.snapshot.tables,after.snapshot.tables))throw new Error('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT')
 if(!isDeepStrictEqual(before.snapshot.sequences,after.snapshot.sequences))throw new Error('WORKFLOW_REHEARSAL_PGTAP_DIAGNOSTIC_SEQUENCE_CHANGED')
 return {sequenceAllocations:['0','0'],coveredSequencesUnchanged:true,tablesAndHistoryUnchanged:true,managedCliExpiryChange:expiryChange,catalogueComparableSha256:after.snapshot.catalogueComparableSha256,snapshotSha256:workflowSha(JSON.stringify(after))}
}
export function reviewPgTapDiagnostic({cwd=workflowSourceRoot,linkRoot=workflowLinkedRoot}={}){
 const {executionSources,runtime}=workflowExecutionInventory(cwd),anchor=readAnchor(cwd)
 if(workflowSnapshotOutputAllowance.sqlSha256!==workflowSha(workflowNativeSnapshotSql))throw new Error('WORKFLOW_REHEARSAL_SNAPSHOT_ALLOWANCE_SOURCE_CHANGED')
 const manifest={schemaVersion:1,operation:'ONE pgTAP-only rollback diagnostic',projectRef:'gtgljlnhwvhqdnwrfdfj',linkedTarget:readWorkflowLinkMetadata(linkRoot),executionSources,runtime,migrations:[],fixtures:[],assertions:0,costDml:false,extensionCreateStatements:1,sequenceAllocationsAllowed:0,sequenceRestoration:false,anchor:{file:pgTapDiagnosticAnchorFile,sha256:workflowSha(readFileSync(resolve(cwd,pgTapDiagnosticAnchorFile))),catalogueObjectCount:anchor.snapshot.catalogueObjectCount,comparison:'all tables/history and historical covered sequences exact; complete catalogue with existing CLI expiry-only exception'},pgtap:{...workflowPgTapSetup,installations:1,rollback:'same-session-pgtap-only',retain:false},nativeExpiryPolicy:workflowNativeExpiryPolicy,snapshotSqlSha256:workflowSha(workflowNativeSnapshotSql),stateCollectionSqlSha256:workflowSha(workflowNativeStateCollectionSql),allSequenceCensus:{sqlSha256:workflowSha(pgTapDiagnosticAllSequenceSql),collectorSha256:workflowSha(allSequenceCollectionSql),coverage:'ALL pg_sequence rows across ALL namespaces; fresh before/after counters and same-transaction exact admission',allocationAllowance:0},clockSqlSha256:workflowSha(workflowAdmissionClockSql),payloadSqlSha256:workflowSha(pgTapDiagnosticPayloadSql),managedDdlHandlers:workflowManagedDdlHandlers,metadataSqlSha256:workflowSha(workflowPgTapMetadataSql),metadataEvidence:{prefix:'WORKFLOW_REHEARSAL_PGTAP_METADATA',serverSeverity:'WARNING',requiredLogThreshold:'warning-or-lower',beforeInstalledGuard:true,maxEncodedBytes:2048,unknownLabels:'sha256',failureRecovery:'durable Postgres log correlated by application_name; local recovery index and sanitized CLI error'},timeouts:workflowTimeouts,clientLimits:workflowQueryLimits,snapshotOutputAllowance:workflowSnapshotOutputAllowance,lock:'/data/remote-jobs/validation.lock',maxInvocations:1,marker:'pgtap-diagnostic-MANIFEST.started.json',cleanup:'existing exact owned backend identity and admission-expiry closure',retention:'complete fresh before/after snapshots on success or batch failure; stop on any drift or uncertain cleanup',retries:0,apply:false,deploy:false,providerActivation:false}
 return {...manifest,manifestSha256:workflowSha(JSON.stringify(manifest))}
}
export function reservePgTapDiagnostic(directory,manifestSha256,record){
 if(!/^[a-f0-9]{64}$/.test(manifestSha256)||!/^[a-f0-9]{64}$/.test(record?.baselineSha256||''))throw new Error('WORKFLOW_REHEARSAL_AUTHORIZATION_REQUIRED')
 mkdirSync(directory,{recursive:true})
 try{writeFileSync(resolve(directory,'pgtap-diagnostic-'+manifestSha256+'.started.json'),JSON.stringify({...record,manifestSha256,startedAt:new Date().toISOString()}),{flag:'wx',mode:0o600})}catch(error){if(error?.code==='EEXIST')throw new Error('WORKFLOW_REHEARSAL_RETRY_ALREADY_CONSUMED',{cause:error});throw error}
}
const labels=['postgres','cli_login_postgres','supabase_admin','supabase_privileged_role']
const safeHash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value)
const safeVersion=value=>typeof value==='string'&&(/^[0-9]{1,3}(?:[.][0-9]{1,3}){1,3}$/.test(value)||safeHash(value))
const keys=(value,wanted)=>value&&typeof value==='object'&&!Array.isArray(value)&&isDeepStrictEqual(Object.keys(value).sort(),[...wanted].sort())
const oid=value=>typeof value==='string'&&/^[1-9][0-9]{0,9}$/.test(value)&&BigInt(value)<=4294967295n||Number.isInteger(value)&&value>0&&value<=4294967295
function safeOwnerAttributes(value){
 if(!keys(value,Object.keys(workflowPgTapOwnerPolicy.attributes)))return false
 for(const [key,expected] of Object.entries(workflowPgTapOwnerPolicy.attributes)){
  if(typeof expected==='boolean'&&typeof value[key]!=='boolean')return false
  if(key==='rolconnlimit'&&(!Number.isInteger(value[key])||value[key]<-1||value[key]>2147483647))return false
  if(key==='rolvaliduntil'&&value[key]!==null&&!(typeof value[key]==='string'&&Buffer.byteLength(value[key],'utf8')<=50&&(/^[0-9: .T+Z-]+$/.test(value[key])||['infinity','-infinity'].includes(value[key]))))return false
 }
 return true
}
export function parsePgTapDiagnosticMetadata(value){
 let data
 try{if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>2048)throw Error();data=JSON.parse(value)
  if(!keys(data,['schemaVersion','phase','expected','actual','caller','defaultVersion','planMember'])||data.schemaVersion!==2||data.phase!=='installed'||!isDeepStrictEqual(data.expected,expectedMetadata)||!safeVersion(data.defaultVersion)||typeof data.planMember!=='boolean')throw Error()
  if(!keys(data.caller,['currentUser','sessionUser','currentUserSuperuser'])||![data.caller.currentUser,data.caller.sessionUser].every(v=>labels.includes(v)||safeHash(v))||typeof data.caller.currentUserSuperuser!=='boolean')throw Error()
  if(data.actual!==null&&(!keys(data.actual,['version','schemaOid','schema','ownerOid','owner','ownerAttributes'])||!safeVersion(data.actual.version)||!oid(data.actual.schemaOid)||!oid(data.actual.ownerOid)||!(['extensions','public','pg_catalog'].includes(data.actual.schema)||safeHash(data.actual.schema))||!(labels.includes(data.actual.owner)||safeHash(data.actual.owner))||!safeOwnerAttributes(data.actual.ownerAttributes)))throw Error()
 }catch{throw new Error('WORKFLOW_REHEARSAL_PGTAP_METADATA_INVALID')}
 return data
}
function metadataResult(response){
 if(response?.rows?.length!==1||response.rows[0]?.result!=='WORKFLOW_PGTAP_DIAGNOSTIC_GUARD_ACCEPTED')throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
 const metadata=parsePgTapDiagnosticMetadata(response.rows[0].metadata)
 assertWorkflowPgTapInstalledMetadata(metadata)
 if(metadata.caller.currentUser!=='postgres'||metadata.caller.sessionUser!=='postgres'||metadata.caller.currentUserSuperuser)throw new Error('WORKFLOW_REHEARSAL_PGTAP_INSTALLED_VERSION')
 return metadata
}
const category=error=>/^WORKFLOW_REHEARSAL_[A-Z_]+(?::[A-Z_0-9]+)?$/.test(error?.message)?error.message:'WORKFLOW_REHEARSAL_OPERATION_FAILED'
export async function runPgTapDiagnostic({cwd=workflowSourceRoot,linkRoot=workflowLinkedRoot,env=process.env,execute=false,confirmation,query,acquireLock=acquireWorkflowValidationLock,assertTarget=assertCloudDevTarget,archive,reserve,delay,nonceFactory=()=> 'c1cw-'+randomUUID()}={}){
 const manifest=reviewPgTapDiagnostic({cwd,linkRoot})
 if(!execute)return {mode:'preview',...manifest}
 if(confirmation!==manifest.manifestSha256||env.TASKOVIA_PGTAP_DIAGNOSTIC_APPROVAL!==manifest.manifestSha256)throw new Error('WORKFLOW_REHEARSAL_AUTHORIZATION_REQUIRED')
 assertTarget({cwd:linkRoot,env})
 const lease=await acquireLock(),runId=randomUUID(),nonce=nonceFactory(),directory=resolve(cwd,artifactDirectory)
 const write=archive||((value,label)=>{mkdirSync(directory,{recursive:true});writeFileSync(resolve(directory,'pgtap-'+runId+'-'+label+'.json'),JSON.stringify(value,null,2),{flag:'wx',mode:0o600})})
 try{
  const child=query||createWorkflowQuery({linkRoot,linkedMetadata:manifest.linkedTarget,env:isolatedSupabaseEnvironment(linkRoot,env,process.platform),binary:workflowExecutionInventory(cwd).binary,assertHeld:()=>lease.assertHeld()})
  const runQuery=async(...args)=>{lease.assertHeld();assertWorkflowLinkUnchanged(linkRoot,manifest.linkedTarget);try{return await child(...args)}finally{lease.assertHeld();assertWorkflowLinkUnchanged(linkRoot,manifest.linkedTarget)}}
  const snapshotArchiveFailures=[]
  const captureResponse=async(sql,label,decode)=>{const response=await runQuery(sql);try{await write(response?.rows?.length===1?response.rows[0]:response,label)}catch{snapshotArchiveFailures.push(label)}return decode(response)}
  const capture=label=>captureResponse(workflowNativeSnapshotSql,label,responseSnapshot)
  const captureSequences=label=>captureResponse(pgTapDiagnosticAllSequenceSql,label,parsePgTapAllSequences)
  await runQuery("begin read only;set local statement_timeout='10s';set local transaction_timeout='15s';"+pgTapDiagnosticPreflightSql+"rollback;")
  const before=await capture('snapshot-before'),anchor=readAnchor(cwd)
  assertPgTapDiagnosticState(anchor,before)
  const allBefore=await captureSequences('all-sequences-before')
  assertCoveredSequences(before,allBefore)
  if(snapshotArchiveFailures.length)throw new Error('WORKFLOW_REHEARSAL_DIAGNOSTIC_ARCHIVE_FAILED')
  if(reviewPgTapDiagnostic({cwd,linkRoot}).manifestSha256!==manifest.manifestSha256)throw new Error('WORKFLOW_REHEARSAL_SOURCE_CHANGED')
  const baselineSha256=workflowSha(JSON.stringify(before))
  await (reserve||((record)=>reservePgTapDiagnostic(directory,manifest.manifestSha256,record)))({baselineSha256,runId,nonce})
  const recovery={projectRef:manifest.projectRef,manifestSha256:manifest.manifestSha256,runId,applicationName:nonce,serverSnapshotTime:before.server_time,metadataPrefix:manifest.metadataEvidence.prefix,serverSeverity:'WARNING',expected:expectedMetadata,sequenceAllocationsAllowed:0}
  await write(recovery,'recovery-index')
  const stateAdmission=workflowNativeAdmissionStateSql(before)+allSequenceAdmissionSql(allBefore)
  // Source, full-state preparation and all large archives precede the tiny clock.
  const clock=workflowNativeAdmissionClock(await runQuery(workflowAdmissionClockSql),before),owner={nonce,...clock}
  const sql=workflowAdmissionSql(owner)+stateAdmission+pgTapDiagnosticPayloadSql+"rollback;"
  let failure,diagnosticArchiveFailure,cleanupFailure,postflightFailure,cleanup,after,allAfter,closure,metadata
  try{const response=await runQuery(sql,{timeoutMs:workflowQueryLimits.batchMs});await write(response,'metadata-response');metadata=metadataResult(response)}
  catch(error){failure=error;try{await write({code:category(error),native:workflowCliDiagnostic(error),recovery},'diagnostic')}catch{diagnosticArchiveFailure=new Error('WORKFLOW_REHEARSAL_DIAGNOSTIC_ARCHIVE_FAILED')}}
  try{cleanup=await closeOwnedWorkflowBackend({query:runQuery,owner,delay})}catch(error){cleanupFailure=error}
  try{after=await capture('snapshot-after')}catch(error){postflightFailure=error}
  try{allAfter=await captureSequences('all-sequences-after')}catch(error){postflightFailure ||=error}
  try{
   if(after){closure=assertPgTapDiagnosticState(before,after);assertPgTapDiagnosticState(anchor,after)}
   if(allAfter){const complete=assertPgTapAllSequences(allBefore,allAfter);if(after)assertCoveredSequences(after,allAfter);if(closure)closure={...closure,...complete}}
  }catch(error){postflightFailure ||=error}
  const snapshotArchiveFailure=snapshotArchiveFailures.length>0
  let closureArchiveFailure
  try{await write({runId,manifestSha256:manifest.manifestSha256,cleanup:cleanup||null,closure:closure||null,primary:failure?category(failure):null,cleanupFailure:cleanupFailure?category(cleanupFailure):null,postflightFailure:postflightFailure?category(postflightFailure):null,diagnosticArchiveFailure:!!diagnosticArchiveFailure,snapshotArchiveFailures,actualAssertions:0,automaticReplay:false},'closure')}catch{closureArchiveFailure=new Error('WORKFLOW_REHEARSAL_DIAGNOSTIC_ARCHIVE_FAILED')}
  if(failure||cleanupFailure||postflightFailure||diagnosticArchiveFailure||snapshotArchiveFailure||closureArchiveFailure){
   const onlyPrimary=failure&&!cleanupFailure&&!postflightFailure&&!diagnosticArchiveFailure&&!snapshotArchiveFailure&&!closureArchiveFailure
   const code=onlyPrimary?category(failure):'WORKFLOW_REHEARSAL_PGTAP_DIAGNOSTIC_FAILED'
   throw workflowWrapCliFailure(code,failure)
  }
  if(!cleanup||!closure)throw new Error('WORKFLOW_REHEARSAL_CLEANUP_UNCERTAIN')
  return {mode:'executed',...manifest,runId,applicationName:nonce,baselineSha256,metadata,rollbackConfirmed:true,cleanup,closure,sequenceAllocations:['0','0'],actualAssertions:0}
 }finally{await lease.release()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2)
 if(args.length&&!(args.length===3&&args[0]==='--execute'&&args[1]==='--confirm-manifest-sha256'&&/^[a-f0-9]{64}$/.test(args[2])))throw new Error('Usage: [--execute --confirm-manifest-sha256 HASH]')
 console.log(JSON.stringify(await runPgTapDiagnostic({execute:args[0]==='--execute',confirmation:args[2]}),null,2))
}
