import {workflowCashSuiteIndexes,readWorkflowCashProvenance,workflowCashCumulative,workflowCashPriorAllocations,workflowCashCurrentRunBudgets} from './c1-cost-workflow-rehearsal-cash.mjs'
import {workflowRemainingSuiteIndexes,workflowRemainingTimeouts,workflowRemainingAdmissionPolicy,readWorkflowRemainingProvenance,assertWorkflowRemainingBaseline,workflowRemainingAdmissionSql,workflowRemainingCumulative,workflowRemainingPriorAllocations,workflowRemainingCumulativeBudgets} from './c1-cost-workflow-rehearsal-remaining.mjs'
import {workflowAllSequencePolicy,workflowAllSequenceSnapshotSql,workflowAllSequenceSnapshot,assertWorkflowAllSequencePostflight,assertWorkflowAllSequenceOverlap,workflowAllSequenceAdmissionSql} from './c1-cost-workflow-rehearsal-all-sequences.mjs'
import {workflowNativeExpiryPolicy,workflowNativeSnapshotSql,assertWorkflowNativeSnapshot,assertWorkflowNativePostflight,workflowNativeBaseline,assertWorkflowNativeBaseline,reserveWorkflowNativeRetry,workflowNativeStateCollectionSql,workflowNativeAdmissionPolicy,workflowNativeAdmissionStateSql,workflowAdmissionClockSql,workflowNativeAdmissionClock} from './c1-cost-workflow-rehearsal-native.mjs'
import {workflowManagedStorageBaseline} from './c1-cost-workflow-rehearsal-managed-storage.mjs'
import {workflowReviewedBaselineCorrections,workflowReviewedPolicyRoots,workflowReviewedPolicyScope} from './c1-cost-workflow-rehearsal-baseline.mjs'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {workflowLinkedRoot,readWorkflowLinkMetadata,assertWorkflowLinkUnchanged} from './c1-cost-workflow-rehearsal-link.mjs'
import {workflowPgTapSetup,workflowPgTapSetupSql} from './c1-cost-workflow-rehearsal-pgtap.mjs'
import {workflowManagedDdlHandlers} from './c1-cost-workflow-rehearsal-managed-ddl.mjs'
import {assertCloudDevTarget} from './assert-cloud-dev-target.mjs'
import {isolatedSupabaseEnvironment} from './run-supabase-dev.mjs'
import {buildC1MigrationRehearsalSql,validateC1MigrationRehearsalSql} from './run-c1-cloud-dev-migration-rehearsal.mjs'
import {costWorkflowSqlFiles,validateCostWorkflowSql,assertWorkflowTapResult} from './run-c1-cost-workflow-tests.mjs'
import {workflowRehearsalSetupSql,workflowHistoryCaptureSql,workflowHistoryClosureSql} from './c1-cost-workflow-rehearsal-guards.mjs'
import {workflowSourceRoot,workflowSha,workflowExecutionInventory,readWorkflowBaseMigrations,workflowDependencyInventory} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {acquireWorkflowValidationLock,createWorkflowQuery,workflowQueryLimits,workflowSnapshotOutputAllowance,workflowCliDiagnostic,workflowWrapCliFailure} from './c1-cost-workflow-rehearsal-transport.mjs'
import {workflowSequenceNames,workflowSequenceBudgets,workflowCumulativeBudgets,workflowTimeouts,workflowDependencyPreflightSql,workflowAdmissionSql,workflowSequenceGuardSql,workflowSequenceClosureSql,workflowBackendCensusSql,assertOwnedWorkflowBackend,workflowTerminateSql} from './c1-cost-workflow-rehearsal-catalog.mjs'
export const costWorkflowMigrationFiles=[
 '20261004210000_c1_cost_workflow_foundation.sql',
 '20261004210100_c1_cost_workflow_security.sql',
 '20261004210200_c1_cost_request_evidence.sql',
 '20261004210300_c1_cost_workflow_request_commands.sql',
 '20261004210400_c1_cost_workflow_cash_commands.sql',
 '20261004210500_c1_cost_workflow_reconciliation.sql',
 '20261004210600_c1_cost_workflow_extraction.sql',
 '20261004210700_c1_cost_workflow_directory.sql',
]
export const costWorkflowAssertionCounts=[80,13,28,22]

// Only the four reviewed, single-line TAP statements are wrapped. Command SELECTs,
// INSERT SELECT bodies and dollar-quoted assertion arguments remain byte-for-byte.
export function workflowCollectTapSql(test,index){
 let plans=0,assertions=0,finishes=0
 const lines=test.split('\n').map(line=>{
  const head=/^\s*select\s+(plan|ok|is|lives_ok|throws_ok)\(/i.exec(line)
  if(head){
   if(!/^\s*select\s+(?:plan|ok|is|lives_ok|throws_ok)\([\s\S]*\);\s*$/i.test(line))throw new Error('WORKFLOW_REHEARSAL_TAP_SOURCE')
   if(head[1].toLowerCase()==='plan')plans++;else assertions++
   const expression=line.trim().slice(0,-1)
   if(expression.includes('$workflow_tap_capture$'))throw new Error('WORKFLOW_REHEARSAL_TAP_SOURCE')
   // Evaluate the original assertion once. Fail at the first caught TAP error,
   // before dependent commands can obscure it; export no arbitrary TAP prose.
   return `do $workflow_tap_capture$
declare workflow_tap_text text;workflow_tap_state text;
begin
 workflow_tap_text:=(${expression});
 perform pg_catalog.set_config('taskovia.workflow_tap_rows',(pg_catalog.current_setting('taskovia.workflow_tap_rows')::jsonb||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tap',workflow_tap_text)))::text,true);
 if workflow_tap_text~'^(not ok|Bail out!)' then
  workflow_tap_state:=pg_catalog.substring(workflow_tap_text,'(?n)^#[ ]+(?:died|caught): ([0-9A-Z]{5}):');
  raise exception using errcode='P0001',message='WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE assertion=${assertions} sqlstate='||coalesce(workflow_tap_state,'unknown');
 end if;
end;$workflow_tap_capture$;`
  }
  if(/^\s*select\s+\*\s+from\s+finish\b/i.test(line)){
   if(!/^\s*select \* from finish\(\);\s*$/i.test(line))throw new Error('WORKFLOW_REHEARSAL_TAP_SOURCE')
   finishes++
   return "select pg_catalog.set_config('taskovia.workflow_tap_rows',(pg_catalog.current_setting('taskovia.workflow_tap_rows')::jsonb||coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('finish',workflow_finish.value)) from (select * from finish()) workflow_finish(value)),'[]'::jsonb))::text,true);"
  }
  return line
 })
 if(plans!==1||assertions!==costWorkflowAssertionCounts[index]||finishes!==1)throw new Error('WORKFLOW_REHEARSAL_TAP_SOURCE')
 return "select pg_catalog.set_config('taskovia.workflow_tap_rows','[]',true);\n"+lines.join('\n')
}
export const workflowTapEnvelopeSql="select pg_catalog.current_setting('taskovia.workflow_tap_rows')::jsonb as tap_rows,'C1_COST_WORKFLOW_HISTORY_CLOSED' as result;"
function workflowTapRows(response){
 if(response?.rows?.length!==1||response.rows[0]?.result!=='C1_COST_WORKFLOW_HISTORY_CLOSED')throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
 const rows=value(response.rows[0].tap_rows)
 if(!Array.isArray(rows)||rows.some(row=>!row||typeof row!=='object'||Object.keys(row).length!==1||!['tap','finish'].includes(Object.keys(row)[0])||typeof Object.values(row)[0]!=='string'))throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
 return {rows}
}
export function readWorkflowRehearsal(cwd){
 return {migrations:costWorkflowMigrationFiles.map(name=>({name,sql:readFileSync(resolve(cwd,'supabase/migrations',name),'utf8')})),suites:costWorkflowSqlFiles.map(name=>({name,sql:readFileSync(resolve(cwd,'supabase/tests/database/c1',name),'utf8')}))}
}
export function reviewWorkflowRehearsal({migrations,suites,cwd=workflowSourceRoot,linkRoot=workflowLinkedRoot,profile='full143'}){
 if(!Array.isArray(migrations)||migrations.length!==costWorkflowMigrationFiles.length||migrations.some((m,i)=>m.name!==costWorkflowMigrationFiles[i]||typeof m.sql!=='string'||!m.sql.trim()))throw new Error('WORKFLOW_REHEARSAL_MIGRATION_SET')
 buildC1MigrationRehearsalSql(migrations.map(m=>m.sql).join('\n'))
 if(!Array.isArray(suites)||suites.length!==costWorkflowSqlFiles.length||suites.some((s,i)=>s.name!==costWorkflowSqlFiles[i]))throw new Error('WORKFLOW_REHEARSAL_TEST_SET')
 for(const [index,suite] of suites.entries()){
  validateCostWorkflowSql(suite.name,suite.sql)
  const plans=[...suite.sql.matchAll(/select\s+plan\((\d+)\)/gi)]
  if(plans.length!==1||Number(plans[0][1])!==costWorkflowAssertionCounts[index])throw new Error('WORKFLOW_REHEARSAL_PLAN')
 }
 if(!['full143','remaining63','cash22'].includes(profile))throw Error('WORKFLOW_REHEARSAL_PROFILE_INVALID')
 const cash=profile==='cash22',prior=cash?readWorkflowCashProvenance(cwd,{migrations,suites}):profile==='remaining63'?readWorkflowRemainingProvenance(cwd,{migrations,suites}):null
 const priorAllocations=cash?workflowCashPriorAllocations:workflowRemainingPriorAllocations
 const baseMigrations=readWorkflowBaseMigrations(cwd)
 const dependencyInventory=workflowDependencyInventory({baseMigrations,migrations,suites})
 const {executionSources,runtime}=workflowExecutionInventory(cwd)
 if(workflowSnapshotOutputAllowance.sqlSha256!==workflowSha(workflowNativeSnapshotSql))throw new Error('WORKFLOW_REHEARSAL_SNAPSHOT_ALLOWANCE_SOURCE_CHANGED')
 const manifest={schemaVersion:cash?11:prior?10:8,...(prior?{executionSuites:(cash?workflowCashSuiteIndexes:workflowRemainingSuiteIndexes).map(index=>({index,name:suites[index].name,sha256:workflowSha(suites[index].sql),assertions:costWorkflowAssertionCounts[index]})),executedAssertionCount:cash?22:63,retainedSecurity:prior.descriptor,cleanupAdmission:{maximumCensusAttempts:30,minimumDelayMs:1035,waitPastSeconds:30}}:{}),allSequencePolicy:workflowAllSequencePolicy,allSequenceSnapshotSqlSha256:workflowSha(workflowAllSequenceSnapshotSql),nativeAdmissionPolicy:prior?workflowRemainingAdmissionPolicy:workflowNativeAdmissionPolicy,nativeAdmissionStateCollectionSqlSha256:workflowSha(workflowNativeStateCollectionSql),nativeAdmissionClockSqlSha256:workflowSha(workflowAdmissionClockSql),snapshotOutputAllowance:workflowSnapshotOutputAllowance,nativeExpiryPolicy:workflowNativeExpiryPolicy,nativeSnapshotSqlSha256:workflowSha(workflowNativeSnapshotSql),reviewedPolicyRoots:workflowReviewedPolicyRoots,reviewedPolicyScope:workflowReviewedPolicyScope,managedStorageBaseline:workflowManagedStorageBaseline,reviewedBaselineCorrections:workflowReviewedBaselineCorrections,linkedTarget:readWorkflowLinkMetadata(linkRoot),managedDdlHandlers:workflowManagedDdlHandlers,pgTapSetup:prior?{...workflowPgTapSetup,installations:cash?1:3}:workflowPgTapSetup,selectOnlyIdentities:dependencyInventory.selectOnlyIdentities,projectRef:'gtgljlnhwvhqdnwrfdfj',operation:cash?'rollback-only-cash22-after-retained121':prior?'rollback-only-remaining63-after-retained80':'rollback-only-DDL-and-synthetic-pgTAP-with-bounded-surrogate-gaps',executionSources,runtime,baseMigrations:baseMigrations.map(m=>({name:m.name,sha256:workflowSha(m.sql)})),dependencyInventorySha256:workflowSha(JSON.stringify(dependencyInventory)),migrations:migrations.map(m=>({name:m.name,sha256:workflowSha(m.sql)})),suites:suites.map((s,i)=>({name:s.name,sha256:workflowSha(s.sql),assertions:costWorkflowAssertionCounts[i]})),sequenceException:{names:workflowSequenceNames,perSuite:workflowSequenceBudgets,total:prior?workflowRemainingCumulativeBudgets:workflowCumulativeBudgets,...(prior?{priorCumulativeAllocations:priorAllocations,currentRunTotal:cash?workflowCashCurrentRunBudgets:workflowCumulativeBudgets}:{}),reset:false},timeouts:prior?workflowRemainingTimeouts:workflowTimeouts,clientLimits:workflowQueryLimits,lock:'/data/remote-jobs/validation.lock',trustBoundary:'Managed pgcrypto/uuid-ossp members and exact server-bundled pgTAP 1.3.3 created in extensions inside each rollback transaction; pgTAP must be absent before and after every batch, with existing privileges only. Catalogues and versions frozen per batch. All six reviewed managed DDL registrations are pinned bidirectionally; unknown or modified registrations, source functions, attached triggers or reachable sequences fail closed. workflow_node_events identity is SELECT-only and has zero allocation/drift allowance.',retention:'Fresh before/after rollback snapshots cover data, catalogues, grants, extension state and all other sequence counters. Stop on any drift or uncertain cleanup.'}
 return {...manifest,manifestSha256:workflowSha(JSON.stringify(manifest))}
}
function value(value){if(typeof value==='string'){try{return JSON.parse(value)}catch{throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')}}return value}
function snapshotResult(response){
 const rows=response?.rows?.filter(row=>row?.snapshot)
 if(rows?.length!==1)throw new Error('WORKFLOW_REHEARSAL_SNAPSHOT_INVALID')
 const row=rows[0],snapshot=value(row.snapshot)
 if(!snapshot||typeof snapshot!=='object'||!snapshot.tables||!snapshot.sequences||!/^[a-f0-9]{64}$/.test(snapshot.catalogueSha256)||!Number.isFinite(Date.parse(row.server_time))||typeof row.database!=='string'||typeof row.username!=='string')throw new Error('WORKFLOW_REHEARSAL_SNAPSHOT_INVALID')
 assertWorkflowNativeSnapshot({...row,snapshot})
 return {snapshot,serverTime:row.server_time,server_time:row.server_time,database:row.database,username:row.username}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
export async function closeOwnedWorkflowBackend({query,owner,delay=sleep,admissionSeconds=workflowTimeouts.admissionSeconds}){
 if(![10,30].includes(admissionSeconds))throw Error('WORKFLOW_REHEARSAL_PROFILE_INVALID')
 const admissionExpiry=Date.parse(owner.serverTime)+admissionSeconds*1000
 const pollDelayMs=Math.max(500,Math.ceil(admissionSeconds*1000/29))
 for(let attempt=0;attempt<30;attempt++){
  const response=await query(workflowBackendCensusSql(owner))
  const row=response?.rows?.[0],backends=value(row?.backends),now=Date.parse(row?.server_time)
  if(response?.rows?.length!==1||!Array.isArray(backends)||!Number.isFinite(now))throw new Error('WORKFLOW_REHEARSAL_CLEANUP_UNCERTAIN')
  for(const backend of backends){
   // An idle pooled session with our last query has no remaining owned transaction.
   if(backend.transactionStart===null&&backend.applicationName!==owner.nonce)continue
   assertOwnedWorkflowBackend(backend,owner)
   const terminated=await query(workflowTerminateSql(backend,owner))
   if(terminated?.rows?.length>1||terminated?.rows?.some(row=>row.terminated!==true))throw new Error('WORKFLOW_REHEARSAL_TERMINATION_FAILED')
  }
  if(backends.every(b=>b.transactionStart===null&&b.applicationName!==owner.nonce)&&now>=admissionExpiry)return {admissionExpired:true,ownedTransactionAbsent:true}
  await delay(pollDelayMs)
 }
 throw new Error('WORKFLOW_REHEARSAL_CLEANUP_UNCERTAIN')
}
export async function runWorkflowRehearsal({cwd=process.cwd(),linkRoot=workflowLinkedRoot,env=process.env,migrations,suites,execute=false,captureBaseline=false,confirmation,authorization,baseline,baselineConfirmation,archiveSnapshot,reserveRetry,assertTarget=assertCloudDevTarget,query,acquireLock=acquireWorkflowValidationLock,delay=sleep,nonceFactory=()=> 'c1cw-'+randomUUID(),profile='full143'}={}){
 if(!['full143','remaining63','cash22'].includes(profile))throw Error('WORKFLOW_REHEARSAL_PROFILE_INVALID')
 const sources=migrations&&suites?{migrations,suites}:readWorkflowRehearsal(cwd)
 const manifest=reviewWorkflowRehearsal({...sources,cwd,linkRoot,profile})
 if(!execute&&!captureBaseline)return {mode:'preview',...manifest}
 const cash=profile==='cash22',prior=cash?readWorkflowCashProvenance(cwd,sources):profile==='remaining63'?readWorkflowRemainingProvenance(cwd,sources):null
 const priorAllocations=cash?workflowCashPriorAllocations:workflowRemainingPriorAllocations,cumulativeWithPrior=cash?workflowCashCumulative:workflowRemainingCumulative
 const suiteIndexes=cash?workflowCashSuiteIndexes:prior?workflowRemainingSuiteIndexes:[0,1,2,3]
 if(execute&&captureBaseline)throw new Error('WORKFLOW_REHEARSAL_MODE_INVALID')
 if(confirmation!==manifest.manifestSha256||authorization!==manifest.manifestSha256)throw new Error('WORKFLOW_REHEARSAL_AUTHORIZATION_REQUIRED')
 assertTarget({cwd:linkRoot,env})
 let acceptedAll
 if(execute){
  assertWorkflowNativeBaseline(baseline,manifest.manifestSha256,baselineConfirmation)
  if(!baseline.row.allSequences)throw new Error('WORKFLOW_REHEARSAL_ALL_SEQUENCE_BASELINE_REQUIRED')
  acceptedAll=workflowAllSequenceSnapshot({rows:[baseline.row.allSequences]})
  assertWorkflowAllSequenceOverlap(baseline.row,acceptedAll)
   if(prior)assertWorkflowRemainingBaseline(baseline.row,prior)
 }
 const cliEnv=isolatedSupabaseEnvironment(linkRoot,env,process.platform)
 const lease=await acquireLock()
 const receipts=[];let cumulative=[0n,0n]
 const archiveRoot=resolve(cwd,'.superpowers/sdd/2026-10-04-document-backed-installment-approval')
 const runId=randomUUID();let snapshotNumber=0,allSequenceSnapshotNumber=0
 const snapshotArchiveFailures=[]
 const archive=archiveSnapshot||((row,label)=>{mkdirSync(archiveRoot,{recursive:true});writeFileSync(resolve(archiveRoot,'native-'+runId+'-'+label+'.json'),JSON.stringify(row,null,2),{mode:0o600,flag:'wx'})})
 try{
  const {binary}=workflowExecutionInventory(cwd)
  const childQuery=query||createWorkflowQuery({linkRoot,linkedMetadata:manifest.linkedTarget,env:cliEnv,binary,assertHeld:()=>lease.assertHeld()})
  const runQuery=async(...args)=>{
   lease.assertHeld();assertWorkflowLinkUnchanged(linkRoot,manifest.linkedTarget)
   try{return await childQuery(...args)}finally{lease.assertHeld();assertWorkflowLinkUnchanged(linkRoot,manifest.linkedTarget)}
  }
  const captureResponse=async(sql,label,decode)=>{const response=await runQuery(sql);try{await archive(response?.rows?.length===1?response.rows[0]:response,label)}catch{snapshotArchiveFailures.push(label)}return decode(response)}
  const capture=()=>captureResponse(workflowNativeSnapshotSql,'snapshot-'+(++snapshotNumber),snapshotResult)
  const captureAll=()=>captureResponse(workflowAllSequenceSnapshotSql,'all-sequences-'+(++allSequenceSnapshotNumber),workflowAllSequenceSnapshot)
  const baseMigrations=readWorkflowBaseMigrations(cwd)
  const dependencies=workflowDependencyInventory({baseMigrations,...sources})
  const baseDependencies=workflowDependencyInventory({baseMigrations,migrations:[],suites:[...sources.suites,{sql:dependencies.relations.join(' ')+' '+dependencies.reachableFunctions.join(' ')}]})
  lease.assertHeld()
  await runQuery("begin read only; set local statement_timeout='10s'; set local transaction_timeout='15s';"+workflowDependencyPreflightSql(baseDependencies,{pgTapPhase:'available'})+"rollback;")
  let before=await capture(),allBefore=await captureAll()
  assertWorkflowAllSequenceOverlap(before,allBefore)
  if(snapshotArchiveFailures.length)throw new Error('WORKFLOW_REHEARSAL_DIAGNOSTIC_ARCHIVE_FAILED')
  if(reviewWorkflowRehearsal({...sources,cwd,linkRoot,profile}).manifestSha256!==manifest.manifestSha256)throw new Error('WORKFLOW_REHEARSAL_SOURCE_CHANGED')
  if(prior)assertWorkflowRemainingBaseline({...before,allSequences:allBefore},prior)
  if(captureBaseline){const captured=workflowNativeBaseline(manifest.manifestSha256,{...before,allSequences:allBefore});await archive(captured,'baseline');return {mode:'baseline-captured',...manifest,baseline:captured}}
  assertWorkflowNativePostflight(baseline.row,before,0,[0n,0n])
  assertWorkflowAllSequencePostflight(acceptedAll,allBefore,0,[0n,0n])
  const reserve=reserveRetry||(()=>reserveWorkflowNativeRetry(archiveRoot,manifest.manifestSha256,baseline.sha256,runId))
  await reserve()
  const initial=before.snapshot
  let previous=before,previousAll=allBefore
  const initialSnapshotSha256=workflowSha(JSON.stringify(initial))
  for(const [position,index] of suiteIndexes.entries()){
   const suite=sources.suites[index]
   lease.assertHeld()
   if(reviewWorkflowRehearsal({...sources,cwd,linkRoot,profile}).manifestSha256!==manifest.manifestSha256)throw new Error('WORKFLOW_REHEARSAL_SOURCE_CHANGED')
   // Fresh server time admits only this bounded invocation, including delayed API starts.
    if(position>0){
     before=await capture();allBefore=await captureAll()
     assertWorkflowNativePostflight(previous,before,0,[0n,0n])
     assertWorkflowAllSequencePostflight(previousAll,allBefore,0,[0n,0n]);assertWorkflowAllSequenceOverlap(before,allBefore)
     if(snapshotArchiveFailures.length)throw new Error('WORKFLOW_REHEARSAL_DIAGNOSTIC_ARCHIVE_FAILED')
    }
   const nonce=nonceFactory()
   const test=workflowCollectTapSql(suite.sql.replace(/^\s*begin\s*;/i,'').replace(/rollback\s*;\s*$/i,''),index)
   const body=workflowRehearsalSetupSql+workflowSequenceGuardSql(index)+workflowDependencyPreflightSql(baseDependencies,{pgTapPhase:'available'})+workflowHistoryCaptureSql('before-DDL')+workflowPgTapSetupSql+sources.migrations.map(m=>m.sql).join('\n')+'\n'+workflowDependencyPreflightSql(dependencies)+workflowHistoryCaptureSql('after-DDL')+"\nset local row_security=on;\n"+test+workflowHistoryClosureSql+workflowSequenceClosureSql(index)
   const wrapped=buildC1MigrationRehearsalSql(body)
   validateC1MigrationRehearsalSql(wrapped)
   // Finish all large/source/state preparation before requesting the tiny clock.
   // Original full before data remains the expected state; it is rechecked inside
   // this transaction before any setup DDL rather than retimestamped.
   const stateAdmission=workflowNativeAdmissionStateSql(before)+workflowAllSequenceAdmissionSql(allBefore)
   const clockResponse=await runQuery(workflowAdmissionClockSql),clock=workflowNativeAdmissionClock(clockResponse,before)
    workflowNativeAdmissionClock(clockResponse,allBefore)
   const owner={nonce,...clock}
   const sql=(prior?workflowRemainingAdmissionSql(owner):workflowAdmissionSql(owner))+stateAdmission+wrapped.replace(/^begin;\s*/i,'').replace(/rollback;\s*$/i,'')+'\n'+workflowTapEnvelopeSql+"\nrollback;"
   let failure,response,cleanup,cleanupFailure,after,postflight,postflightFailure,diagnosticArchiveFailure,allAfter,allPostflight,closureArchiveFailure
   try{
    response=await runQuery(sql,{timeoutMs:workflowQueryLimits.batchMs})
    await archive(response,'tap-'+index)
    const counts=assertWorkflowTapResult(workflowTapRows(response))
    if(counts.assertions!==costWorkflowAssertionCounts[index])throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
   }catch(error){
    failure=error
    const diagnostic=workflowCliDiagnostic(error)
    if(diagnostic){try{await archive(diagnostic,'diagnostic-'+index)}catch{diagnosticArchiveFailure=new Error('WORKFLOW_REHEARSAL_DIAGNOSTIC_ARCHIVE_FAILED')}}
   }
   try{cleanup=await closeOwnedWorkflowBackend({query:runQuery,owner,delay,admissionSeconds:manifest.timeouts.admissionSeconds})}catch(error){cleanupFailure=error}
   // Always attempt fresh postflight, including CLI/parse/timeout/TAP/cleanup failures.
    try{after=await capture()}catch(error){postflightFailure=error}
    try{allAfter=await captureAll()}catch(error){postflightFailure ||=error}
    try{if(after)postflight=assertWorkflowNativePostflight(before,after,index,cumulative)}catch(error){postflightFailure ||=error}
    try{
     if(allAfter){
      allPostflight=assertWorkflowAllSequencePostflight(allBefore,allAfter,index,cumulative)
      if(after)assertWorkflowAllSequenceOverlap(after,allAfter)
      if(postflight&&JSON.stringify(postflight.allocations.map(String))!==JSON.stringify(allPostflight.allocations.map(String)))throw new Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
      if(prior&&postflight)cumulativeWithPrior(postflight.cumulative)
     }
    }catch(error){postflightFailure ||=error}
    const category=error=>/^WORKFLOW_REHEARSAL_[A-Z_]+(?::[A-Z_0-9]+)?$/.test(error?.message)?error.message:'WORKFLOW_REHEARSAL_OPERATION_FAILED'
    try{await archive({suite:suite.name,cleanup:cleanup||null,postflightConfirmed:!!postflight&&!!allPostflight&&!postflightFailure,allSequenceCount:allPostflight?.allSequenceCount||null,sequenceAllocations:allPostflight?.allocations.map(String)||null,...(prior?{priorCumulativeSequenceAllocations:priorAllocations,cumulativeSequenceAllocations:allPostflight?cumulativeWithPrior(allPostflight.cumulative).map(String):null}:{}),primary:failure?category(failure):null,cleanupFailure:cleanupFailure?category(cleanupFailure):null,postflightFailure:postflightFailure?category(postflightFailure):null,diagnosticArchiveFailure:!!diagnosticArchiveFailure,snapshotArchiveFailures:[...snapshotArchiveFailures]},'closure-'+index)}catch{closureArchiveFailure=new Error('WORKFLOW_REHEARSAL_DIAGNOSTIC_ARCHIVE_FAILED')}
    if(failure||cleanupFailure||postflightFailure||diagnosticArchiveFailure||closureArchiveFailure||snapshotArchiveFailures.length){
     if(!cleanupFailure&&!postflightFailure&&!diagnosticArchiveFailure&&!closureArchiveFailure&&!snapshotArchiveFailures.length)throw workflowWrapCliFailure(category(failure),failure)
     throw workflowWrapCliFailure('WORKFLOW_REHEARSAL_FAILURES:'+JSON.stringify({primary:failure?category(failure):null,cleanup:cleanupFailure?category(cleanupFailure):null,postflight:postflightFailure?category(postflightFailure):null,...(diagnosticArchiveFailure?{diagnosticArchive:category(diagnosticArchiveFailure)}:{}),...(closureArchiveFailure||snapshotArchiveFailures.length?{snapshotArchive:'WORKFLOW_REHEARSAL_DIAGNOSTIC_ARCHIVE_FAILED'}:{})}),failure)
    }
    if(!cleanup||!postflight||!allPostflight)throw new Error('WORKFLOW_REHEARSAL_CLEANUP_UNCERTAIN')
   lease.assertHeld()
   cumulative=postflight.cumulative
    if(prior)cumulativeWithPrior(cumulative)
   previous=after;previousAll=allAfter
   // Command success includes the trailing ROLLBACK. Confirm only after owned
   // transaction absence and fresh exact data/catalogue/sequence postflight.
   const receipt={suite:suite.name,assertions:costWorkflowAssertionCounts[index],rollbackConfirmed:true,...cleanup,sequenceAllocations:postflight.allocations.map(String),postflightSha256:postflight.snapshotSha256,managedCliExpiryChange:postflight.expiryChange,allSequenceCount:allPostflight.allSequenceCount,unapprovedSequencesUnchanged:true,allSequencePostflightSha256:allPostflight.allSequenceSnapshotSha256}
   await archive(receipt,'receipt-'+index)
   receipts.push(receipt)
  }
   let final,allFinal,finalCaptureFailure
   try{final=await capture()}catch(error){finalCaptureFailure=error}
   try{allFinal=await captureAll()}catch(error){finalCaptureFailure ||=error}
   if(finalCaptureFailure)throw finalCaptureFailure
   assertWorkflowNativePostflight(previous,final,0,[0n,0n])
   assertWorkflowAllSequencePostflight(previousAll,allFinal,0,[0n,0n]);assertWorkflowAllSequenceOverlap(final,allFinal)
   const finalClosure=assertWorkflowNativePostflight(baseline.row,final,'total',[0n,0n])
   const allFinalClosure=assertWorkflowAllSequencePostflight(acceptedAll,allFinal,'total',[0n,0n])
   if(JSON.stringify(finalClosure.allocations.map(String))!==JSON.stringify(cumulative.map(String))||JSON.stringify(allFinalClosure.allocations.map(String))!==JSON.stringify(cumulative.map(String)))throw new Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
   if(snapshotArchiveFailures.length)throw new Error('WORKFLOW_REHEARSAL_DIAGNOSTIC_ARCHIVE_FAILED')
  return {mode:'executed',...manifest,runId,acceptedBaselineSha256:baseline.sha256,initialSnapshotSha256,receipts,sequenceAllocations:cumulative.map(String),...(prior?{priorCumulativeSequenceAllocations:priorAllocations,cumulativeSequenceAllocations:cumulativeWithPrior(cumulative).map(String)}:{}),snapshotCount:snapshotNumber,allSequenceSnapshotCount:allSequenceSnapshotNumber,finalAllSequenceCount:allFinalClosure.allSequenceCount,finalAllSequenceSha256:allFinalClosure.allSequenceSnapshotSha256,finalCatalogueSha256:final.snapshot.catalogueSha256,finalComparableCatalogueSha256:final.snapshot.catalogueComparableSha256}
 }finally{await lease.release()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),execute=args[0]==='--execute',captureBaseline=args[0]==='--capture-baseline'
 if(args.length&&!(
  captureBaseline&&args.length===3&&args[1]==='--confirm-manifest-sha256'||
  execute&&args.length===7&&args[1]==='--confirm-manifest-sha256'&&args[3]==='--baseline-file'&&args[5]==='--confirm-baseline-sha256'
 ))throw new Error('Usage: [--capture-baseline --confirm-manifest-sha256 HASH] or [--execute --confirm-manifest-sha256 HASH --baseline-file FILE --confirm-baseline-sha256 HASH]')
 let baseline
 if(execute){try{baseline=JSON.parse(readFileSync(resolve(args[4]),'utf8'))}catch{throw new Error('WORKFLOW_REHEARSAL_BASELINE_INVALID')}}
 const result=await runWorkflowRehearsal({execute,captureBaseline,confirmation:args[2],authorization:process.env.TASKOVIA_WORKFLOW_REHEARSAL_APPROVAL,baseline,baselineConfirmation:args[6]})
 if(result.mode==='baseline-captured'){
  const file=resolve('.superpowers/sdd/2026-10-04-document-backed-installment-approval','native-accepted-baseline-'+result.baseline.sha256+'.json')
  writeFileSync(file,JSON.stringify(result.baseline,null,2),{mode:0o600,flag:'wx'})
  console.log(JSON.stringify({mode:result.mode,manifestSha256:result.manifestSha256,baselineSha256:result.baseline.sha256,baselineFile:file,catalogueObjectCount:result.baseline.row.snapshot.catalogueObjectCount},null,2))
 }else console.log(JSON.stringify(result,null,2))
}
