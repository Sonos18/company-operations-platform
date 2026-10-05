import {workflowManagedStorageBaseline} from './c1-cost-workflow-rehearsal-managed-storage.mjs'
import {workflowReviewedBaselineCorrections,workflowReviewedPolicyRoots,workflowReviewedPolicyScope} from './c1-cost-workflow-rehearsal-baseline.mjs'
import {readFileSync} from 'node:fs'
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
import {acquireWorkflowValidationLock,createWorkflowQuery,workflowQueryLimits} from './c1-cost-workflow-rehearsal-transport.mjs'
import {workflowSequenceNames,workflowSequenceBudgets,workflowCumulativeBudgets,workflowTimeouts,workflowSnapshotSql,workflowDependencyPreflightSql,workflowAdmissionSql,workflowSequenceGuardSql,workflowSequenceClosureSql,assertWorkflowPostflight,workflowBackendCensusSql,assertOwnedWorkflowBackend,workflowTerminateSql} from './c1-cost-workflow-rehearsal-catalog.mjs'
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
export function readWorkflowRehearsal(cwd){
 return {migrations:costWorkflowMigrationFiles.map(name=>({name,sql:readFileSync(resolve(cwd,'supabase/migrations',name),'utf8')})),suites:costWorkflowSqlFiles.map(name=>({name,sql:readFileSync(resolve(cwd,'supabase/tests/database/c1',name),'utf8')}))}
}
export function reviewWorkflowRehearsal({migrations,suites,cwd=workflowSourceRoot,linkRoot=workflowLinkedRoot}){
 if(!Array.isArray(migrations)||migrations.length!==costWorkflowMigrationFiles.length||migrations.some((m,i)=>m.name!==costWorkflowMigrationFiles[i]||typeof m.sql!=='string'||!m.sql.trim()))throw new Error('WORKFLOW_REHEARSAL_MIGRATION_SET')
 buildC1MigrationRehearsalSql(migrations.map(m=>m.sql).join('\n'))
 if(!Array.isArray(suites)||suites.length!==costWorkflowSqlFiles.length||suites.some((s,i)=>s.name!==costWorkflowSqlFiles[i]))throw new Error('WORKFLOW_REHEARSAL_TEST_SET')
 for(const [index,suite] of suites.entries()){
  validateCostWorkflowSql(suite.name,suite.sql)
  const plans=[...suite.sql.matchAll(/select\s+plan\((\d+)\)/gi)]
  if(plans.length!==1||Number(plans[0][1])!==costWorkflowAssertionCounts[index])throw new Error('WORKFLOW_REHEARSAL_PLAN')
 }
 const baseMigrations=readWorkflowBaseMigrations(cwd)
 const dependencyInventory=workflowDependencyInventory({baseMigrations,migrations,suites})
 const {executionSources,runtime}=workflowExecutionInventory(cwd)
 const manifest={schemaVersion:5,reviewedPolicyRoots:workflowReviewedPolicyRoots,reviewedPolicyScope:workflowReviewedPolicyScope,managedStorageBaseline:workflowManagedStorageBaseline,reviewedBaselineCorrections:workflowReviewedBaselineCorrections,linkedTarget:readWorkflowLinkMetadata(linkRoot),managedDdlHandlers:workflowManagedDdlHandlers,pgTapSetup:workflowPgTapSetup,selectOnlyIdentities:dependencyInventory.selectOnlyIdentities,projectRef:'gtgljlnhwvhqdnwrfdfj',operation:'rollback-only-DDL-and-synthetic-pgTAP-with-bounded-surrogate-gaps',executionSources,runtime,baseMigrations:baseMigrations.map(m=>({name:m.name,sha256:workflowSha(m.sql)})),dependencyInventorySha256:workflowSha(JSON.stringify(dependencyInventory)),migrations:migrations.map(m=>({name:m.name,sha256:workflowSha(m.sql)})),suites:suites.map((s,i)=>({name:s.name,sha256:workflowSha(s.sql),assertions:costWorkflowAssertionCounts[i]})),sequenceException:{names:workflowSequenceNames,perSuite:workflowSequenceBudgets,total:workflowCumulativeBudgets,reset:false},timeouts:workflowTimeouts,clientLimits:workflowQueryLimits,lock:'/data/remote-jobs/validation.lock',trustBoundary:'Managed pgcrypto/uuid-ossp members and exact server-bundled pgTAP 1.3.3 created in extensions inside each rollback transaction; pgTAP must be absent before and after every batch, with existing privileges only. Catalogues and versions frozen per batch. All six reviewed managed DDL registrations are pinned bidirectionally; unknown or modified registrations, source functions, attached triggers or reachable sequences fail closed. workflow_node_events identity is SELECT-only and has zero allocation/drift allowance.',retention:'Fresh before/after rollback snapshots cover data, catalogues, grants, extension state and all other sequence counters. Stop on any drift or uncertain cleanup.'}
 return {...manifest,manifestSha256:workflowSha(JSON.stringify(manifest))}
}
function value(value){if(typeof value==='string'){try{return JSON.parse(value)}catch{throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')}}return value}
function snapshotResult(response){
 const rows=response?.rows?.filter(row=>row?.snapshot)
 if(rows?.length!==1)throw new Error('WORKFLOW_REHEARSAL_SNAPSHOT_INVALID')
 const row=rows[0],snapshot=value(row.snapshot)
 if(!snapshot||typeof snapshot!=='object'||!snapshot.tables||!snapshot.sequences||!/^[a-f0-9]{64}$/.test(snapshot.catalogueSha256)||!Number.isFinite(Date.parse(row.server_time))||typeof row.database!=='string'||typeof row.username!=='string')throw new Error('WORKFLOW_REHEARSAL_SNAPSHOT_INVALID')
 return {snapshot,serverTime:row.server_time,database:row.database,username:row.username}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
export async function closeOwnedWorkflowBackend({query,owner,delay=sleep}){
 const admissionExpiry=Date.parse(owner.serverTime)+workflowTimeouts.admissionSeconds*1000
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
  await delay(500)
 }
 throw new Error('WORKFLOW_REHEARSAL_CLEANUP_UNCERTAIN')
}
export async function runWorkflowRehearsal({cwd=process.cwd(),linkRoot=workflowLinkedRoot,env=process.env,migrations,suites,execute=false,confirmation,authorization,assertTarget=assertCloudDevTarget,query,acquireLock=acquireWorkflowValidationLock,delay=sleep,nonceFactory=()=> 'c1cw-'+randomUUID()}={}){
 const sources=migrations&&suites?{migrations,suites}:readWorkflowRehearsal(cwd)
 const manifest=reviewWorkflowRehearsal({...sources,cwd,linkRoot})
 if(!execute)return {mode:'preview',...manifest}
 if(confirmation!==manifest.manifestSha256||authorization!==manifest.manifestSha256)throw new Error('WORKFLOW_REHEARSAL_AUTHORIZATION_REQUIRED')
 assertTarget({cwd:linkRoot,env})
 const cliEnv=isolatedSupabaseEnvironment(linkRoot,env,process.platform)
 const lease=await acquireLock()
 const receipts=[];let cumulative=[0n,0n]
 try{
  const {binary}=workflowExecutionInventory(cwd)
  const childQuery=query||createWorkflowQuery({linkRoot,linkedMetadata:manifest.linkedTarget,env:cliEnv,binary,assertHeld:()=>lease.assertHeld()})
  const runQuery=async(...args)=>{
   lease.assertHeld();assertWorkflowLinkUnchanged(linkRoot,manifest.linkedTarget)
   try{return await childQuery(...args)}finally{lease.assertHeld();assertWorkflowLinkUnchanged(linkRoot,manifest.linkedTarget)}
  }
  const baseMigrations=readWorkflowBaseMigrations(cwd)
  const dependencies=workflowDependencyInventory({baseMigrations,...sources})
  const baseDependencies=workflowDependencyInventory({baseMigrations,migrations:[],suites:[...sources.suites,{sql:dependencies.relations.join(' ')+' '+dependencies.reachableFunctions.join(' ')}]})
  lease.assertHeld()
  await runQuery("begin read only; set local statement_timeout='10s'; set local transaction_timeout='15s';"+workflowDependencyPreflightSql(baseDependencies,{pgTapPhase:'available'})+"rollback;")
  let before=snapshotResult(await runQuery(workflowSnapshotSql))
  const initial=before.snapshot
  let previous=initial
  const initialSnapshotSha256=workflowSha(JSON.stringify(initial))
  for(const [index,suite] of sources.suites.entries()){
   lease.assertHeld()
   if(reviewWorkflowRehearsal({...sources,cwd,linkRoot}).manifestSha256!==manifest.manifestSha256)throw new Error('WORKFLOW_REHEARSAL_SOURCE_CHANGED')
   // Fresh server time admits only this bounded invocation, including delayed API starts.
   if(index>0){before=snapshotResult(await runQuery(workflowSnapshotSql));assertWorkflowPostflight(previous,before.snapshot,0,[0n,0n])}
   const owner={nonce:nonceFactory(),serverTime:before.serverTime,database:before.database,username:before.username}
   const test=suite.sql.replace(/^\s*begin\s*;/i,'').replace(/rollback\s*;\s*$/i,'')
   const body=workflowRehearsalSetupSql+workflowSequenceGuardSql(index)+workflowDependencyPreflightSql(baseDependencies,{pgTapPhase:'available'})+workflowHistoryCaptureSql('before-DDL')+workflowPgTapSetupSql+sources.migrations.map(m=>m.sql).join('\n')+'\n'+workflowDependencyPreflightSql(dependencies)+workflowHistoryCaptureSql('after-DDL')+"\nset local row_security=on;\n"+test+workflowHistoryClosureSql+workflowSequenceClosureSql(index)
   const wrapped=buildC1MigrationRehearsalSql(body)
   validateC1MigrationRehearsalSql(wrapped)
   const sql=workflowAdmissionSql(owner)+wrapped.replace(/^begin;\s*/i,'').replace(/rollback;\s*$/i,'')+"\nrollback;\nselect 'C1_COST_WORKFLOW_ROLLBACK_CONFIRMED' as result,pg_current_xact_id_if_assigned() is null as no_write_transaction;"
   let failure,response,cleanup,cleanupFailure,after,postflight,postflightFailure
   try{
    response=await runQuery(sql,{timeoutMs:workflowQueryLimits.batchMs})
    const counts=assertWorkflowTapResult(response)
    const rollback=response.rows.filter(row=>row.result==='C1_COST_WORKFLOW_ROLLBACK_CONFIRMED')
    if(counts.assertions!==costWorkflowAssertionCounts[index]||!response.rows.some(row=>row.result==='C1_COST_WORKFLOW_HISTORY_CLOSED')||rollback.length!==1||rollback[0].no_write_transaction!==true)throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
   }catch(error){failure=error}
   try{cleanup=await closeOwnedWorkflowBackend({query:runQuery,owner,delay})}catch(error){cleanupFailure=error}
   // Always attempt fresh postflight, including CLI/parse/timeout/TAP/cleanup failures.
   try{after=snapshotResult(await runQuery(workflowSnapshotSql));postflight=assertWorkflowPostflight(before.snapshot,after.snapshot,index,cumulative)}catch(error){postflightFailure=error}
   if(failure||cleanupFailure||postflightFailure){
    const category=error=>/^WORKFLOW_REHEARSAL_[A-Z_]+(?::[A-Z_0-9]+)?$/.test(error?.message)?error.message:'WORKFLOW_REHEARSAL_OPERATION_FAILED'
    if(!cleanupFailure&&!postflightFailure)throw new Error(category(failure))
    throw new Error('WORKFLOW_REHEARSAL_FAILURES:'+JSON.stringify({primary:failure?category(failure):null,cleanup:cleanupFailure?category(cleanupFailure):null,postflight:postflightFailure?category(postflightFailure):null}))
   }
   if(!cleanup||!postflight)throw new Error('WORKFLOW_REHEARSAL_CLEANUP_UNCERTAIN')
   lease.assertHeld()
   cumulative=postflight.cumulative
   previous=after.snapshot
   receipts.push({suite:suite.name,assertions:costWorkflowAssertionCounts[index],rollbackConfirmed:true,...cleanup,sequenceAllocations:postflight.allocations.map(String),postflightSha256:postflight.snapshotSha256})
  }
  const final=snapshotResult(await runQuery(workflowSnapshotSql))
  assertWorkflowPostflight(previous,final.snapshot,0,[0n,0n])
  if(initial.catalogueSha256!==final.snapshot.catalogueSha256||JSON.stringify(initial.tables)!==JSON.stringify(final.snapshot.tables))throw new Error('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT')
  return {mode:'executed',...manifest,initialSnapshotSha256,receipts,sequenceAllocations:cumulative.map(String)}
 }finally{await lease.release()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),execute=args[0]==='--execute'
 if(args.length&&!(execute&&args.length===3&&args[1]==='--confirm-manifest-sha256'))throw new Error('Usage: [--execute --confirm-manifest-sha256 HASH]')
 const result=await runWorkflowRehearsal({execute,confirmation:args[2],authorization:process.env.TASKOVIA_WORKFLOW_REHEARSAL_APPROVAL})
 console.log(JSON.stringify(result,null,2))
}
