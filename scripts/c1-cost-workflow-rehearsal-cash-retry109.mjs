import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {isDeepStrictEqual} from 'node:util'
import {workflowSha,readWorkflowBaseMigrations} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {assertWorkflowNativeSnapshot} from './c1-cost-workflow-rehearsal-native.mjs'
import {workflowAllSequenceSnapshot,assertWorkflowAllSequenceOverlap,assertWorkflowAllSequencePostflight} from './c1-cost-workflow-rehearsal-all-sequences.mjs'
import {assertWorkflowTapResult} from './run-c1-cost-workflow-tests.mjs'
export const workflowCashRetryProfile='cash22-retry109-v1'
export const workflowCashRetryPriorAllocations=Object.freeze(['109','16'])
export const workflowCashRetryCurrentRunBudgets=Object.freeze([56,4])
export const workflowCashRetryCumulativeBudgets=Object.freeze([165,20])
export const workflowCashRetrySourcePins=Object.freeze([{"name": "20261004210000_c1_cost_workflow_foundation.sql", "sha256": "4a81b62fe6b82abb44b2a633fa3987c2e05fd950780a36eb701b25da0622b1a0"}, {"name": "20261004210100_c1_cost_workflow_security.sql", "sha256": "01ef323d06705180c2923945f4684d765e20b5b0b582dbac0a1b729fe2a1c360"}, {"name": "20261004210200_c1_cost_request_evidence.sql", "sha256": "26539f5f08d7ad735c06f6cf336a5997bd36fd33d691725c43e58ab62fcbe574"}, {"name": "20261004210300_c1_cost_workflow_request_commands.sql", "sha256": "89cf9b93f3a1137d8c1092535484310c04aa3558bacd4a751b0cfbe1060a8ed7"}, {"name": "20261004210400_c1_cost_workflow_cash_commands.sql", "sha256": "c76d25c28e25f0463be81e304025464a7a6b530bb6f7cbad26fe54d8a4df01fd"}, {"name": "20261004210500_c1_cost_workflow_reconciliation.sql", "sha256": "54692645e2cc788d96c562c5eda9588ac6fdbf7dace5ebd70b47e7823a22a916"}, {"name": "20261004210600_c1_cost_workflow_extraction.sql", "sha256": "14f373a79bc367cabbb61e45fa19d9f33a47f85f13669ea435ac224317beae1a"}, {"name": "20261004210700_c1_cost_workflow_directory.sql", "sha256": "8ef8cef866e5efc42062a0909ddec7b10fdbcc5975453cd10024fedef8ef6f94"}])
const proposalPin='63b5b344e886fa7ff035269d6fb4a89b7b2bdc222ceadde2d62d6022e6db0aca'
const retainedPins=Object.freeze({"retry109-retained-one-attempt-drift-proof.json": "4b0594b7b0ac0694e4dfc7d51ce83a35913805c0dfdd72466613c93747e1c8ae", "retry109-retained-cash22-user-approval-once.started.json": "07527c0d638b17a3f30c112a5f43aa48d5b88a581ddbe1c969952326010fc210", "retry109-retained-cash22-user-approval-once.finished.json": "96d4302b61c7270100dc687b5e2db9d53c17d1c9a857bf3761383dc8f99be1f5", "retry109-retained-frozen-manifest.json": "0a09ac61953b4303c19896eac5ea845e8628f962962ded1ac4ae1afd366fcb0f"})
const extraEvidencePins=Object.freeze({'native-14ad5a8e-6d52-4255-bf6d-d80a0fc4e8e6-diagnostic-3.json':'82baf0634d623e9176aeb9a719004b2c8b33e87f648dd8790a3538753cf38931'})
const historicalManifestPin='b15952fbec9d3e3f00a7f4f941eaaa6b52b59b06f2325ef193ecd2664df2c6c2'
const directory='.superpowers/sdd/2026-10-04-document-backed-installment-approval'
const run='14ad5a8e-6d52-4255-bf6d-d80a0fc4e8e6'
const fail=()=>{throw Error('WORKFLOW_REHEARSAL_CASH_RETRY_EVIDENCE_CHANGED')}
const check=ok=>{if(!ok)fail()}
const parse=bytes=>{try{return JSON.parse(bytes)}catch{fail()}}
const full=row=>({...row,snapshot:typeof row.snapshot==='string'?parse(row.snapshot):row.snapshot})
export function workflowCashRetryCumulative(current){
 if(!Array.isArray(current)||current.length!==2||current.some(x=>typeof x!=='bigint'||x<0n))throw Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
 const total=current.map((x,i)=>x+BigInt(workflowCashRetryPriorAllocations[i]))
 if(current.some((x,i)=>x>BigInt(workflowCashRetryCurrentRunBudgets[i]))||total.some((x,i)=>x>BigInt(workflowCashRetryCumulativeBudgets[i])))throw Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
 return total
}
export function readWorkflowCashRetryProvenance(cwd,sources){
 const read=(name,pin)=>{const bytes=readFileSync(resolve(cwd,directory,name));check(workflowSha(bytes)===pin);return parse(bytes)}
 const proposal=read('cash22-retry109-lineage-proposal.json',proposalPin)
 const files=Object.fromEntries(Object.entries(proposal.lineagePins).map(([name,pin])=>[name,read(name,pin)]))
 const retained=Object.fromEntries(Object.entries(retainedPins).map(([name,pin])=>[name,read(name,pin)]))
 const proof=retained['retry109-retained-one-attempt-drift-proof.json']
 const started=retained['retry109-retained-cash22-user-approval-once.started.json']
 const finished=retained['retry109-retained-cash22-user-approval-once.finished.json']
 const manifest=retained['retry109-retained-frozen-manifest.json']
 check(proposal.consumedCashRun===run&&proof.runId===run&&proof.attemptConsumed===true&&proof.cashAssertionsConfirmed===0&&proof.retainedAssertions===121&&proof.automaticReplay===false)
 check(started.manifestSha256===manifest.manifestSha256&&started.automaticReplay===false&&finished.exit===1&&finished.automaticReplay===false)
 check(isDeepStrictEqual(proof.actualNewAllocations,['33','4'])&&isDeepStrictEqual(proof.priorCumulative,['76','12'])&&isDeepStrictEqual(proof.cumulative,workflowCashRetryPriorAllocations))
 check(isDeepStrictEqual(sources.migrations.map(x=>({name:x.name,sha256:workflowSha(x.sql)})),workflowCashRetrySourcePins))
 check(sources.suites.length===4&&sources.suites.every((x,i)=>x.name===manifest.suites[i].name&&workflowSha(x.sql)===manifest.suites[i].sha256))
 const historical=read('owner-policy-full-reviewed-manifest.json',historicalManifestPin)
 check(isDeepStrictEqual(readWorkflowBaseMigrations(cwd).map(x=>({name:x.name,sha256:workflowSha(x.sql)})),historical.baseMigrations))
 // Original TAP bytes, strict receipts and closures stay historical, never regenerated.
 const runs=[['394d3595-a01d-47b1-a41f-cb3ca7bd616e',0,80],['3dadead2-edce-47d0-be82-407f5465451e',1,13],['3dadead2-edce-47d0-be82-407f5465451e',2,28]]
 for(const [id,index,count] of runs){
  const tap=files['native-'+id+'-tap-'+index+'.json'],receipt=files['native-'+id+'-receipt-'+index+'.json'],closure=files['native-'+id+'-closure-'+index+'.json']
  check(tap?.rows?.length===1&&tap.rows[0].result==='C1_COST_WORKFLOW_HISTORY_CLOSED')
  const counts=assertWorkflowTapResult({rows:typeof tap.rows[0].tap_rows==='string'?parse(tap.rows[0].tap_rows):tap.rows[0].tap_rows})
  check(counts.assertions===count&&receipt.assertions===count&&receipt.suite===sources.suites[index].name&&receipt.rollbackConfirmed===true&&receipt.admissionExpired===true&&receipt.ownedTransactionAbsent===true&&receipt.unapprovedSequencesUnchanged===true&&receipt.allSequenceCount===5)
  check(closure.postflightConfirmed===true&&closure.cleanup?.admissionExpired===true&&closure.cleanup?.ownedTransactionAbsent===true&&closure.primary===null&&closure.cleanupFailure===null&&closure.postflightFailure===null&&closure.diagnosticArchiveFailure===false&&closure.snapshotArchiveFailures?.length===0)
 }
 for(const [name,pin] of Object.entries(proof.packetPins)){check((proposal.lineagePins[name]??extraEvidencePins[name])===pin);read(name,pin)}
 const before=full(files['native-'+run+'-snapshot-1.json']),after=full(files['native-'+run+'-snapshot-2.json'])
 const beforeAll=workflowAllSequenceSnapshot({rows:[files['native-'+run+'-all-sequences-1.json']]}),afterAll=workflowAllSequenceSnapshot({rows:[files['native-'+run+'-all-sequences-2.json']]})
 assertWorkflowNativeSnapshot(before);assertWorkflowNativeSnapshot(after)
 assertWorkflowAllSequenceOverlap(before,beforeAll);assertWorkflowAllSequenceOverlap(after,afterAll)
 check(isDeepStrictEqual(before.snapshot.tables,after.snapshot.tables))
 check(isDeepStrictEqual(assertWorkflowAllSequencePostflight(beforeAll,afterAll,3,[0n,0n]).allocations,[33n,4n]))
 const closure=files['native-'+run+'-closure-3.json']
 check(closure.postflightConfirmed===false&&closure.cleanup?.admissionExpired===true&&closure.cleanup?.ownedTransactionAbsent===true)
 // This exact retained raw postflight is the explicitly approved new starting state.
 // Subsequent admission/postflight still compare every field, with only the CLI expiry rule.
 return {anchorFull:after,anchorAll:afterAll,descriptor:{profile:workflowCashRetryProfile,retainedPassedAssertions:121,completedSuiteIndexes:[0,1,2],consumedRunId:run,priorStrictPostflight:false,priorCumulativeAllocations:workflowCashRetryPriorAllocations,currentRunAllowance:workflowCashRetryCurrentRunBudgets,cumulativeCeilings:workflowCashRetryCumulativeBudgets,proposalPin,lineagePins:proposal.lineagePins,retainedPins,postflightGuardsUnchanged:true,generalMaintenanceException:false,automaticReplay:false,sequenceReset:false,oneAttempt:true}}
}
export function reserveWorkflowCashRetryOnce(manifestSha256,baselineSha256,runId){
 check(/^[a-f0-9]{64}$/.test(manifestSha256)&&/^[a-f0-9]{64}$/.test(baselineSha256)&&typeof runId==='string')
 const root='/data/remote-jobs/taskovia-cash22-retry109-v1-20261006'
 mkdirSync(root,{recursive:true})
 try{writeFileSync(resolve(root,'once.started.json'),JSON.stringify({profile:workflowCashRetryProfile,manifestSha256,baselineSha256,runId,priorCumulativeAllocations:workflowCashRetryPriorAllocations,allowance:workflowCashRetryCurrentRunBudgets,cumulativeCeilings:workflowCashRetryCumulativeBudgets,automaticReplay:false,startedAt:new Date().toISOString()}),{mode:0o600,flag:'wx'})}catch{throw Error('WORKFLOW_REHEARSAL_RETRY_ALREADY_CONSUMED')}
}
