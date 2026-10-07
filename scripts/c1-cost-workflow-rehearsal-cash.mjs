
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {isDeepStrictEqual} from 'node:util'
import {workflowSha} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {readWorkflowRemainingProvenance} from './c1-cost-workflow-rehearsal-remaining.mjs'
import {assertWorkflowNativeSnapshot,assertWorkflowNativePostflight} from './c1-cost-workflow-rehearsal-native.mjs'
import {workflowAllSequenceSnapshot,assertWorkflowAllSequencePostflight,assertWorkflowAllSequenceOverlap} from './c1-cost-workflow-rehearsal-all-sequences.mjs'
import {assertWorkflowTapResult} from './run-c1-cost-workflow-tests.mjs'
export const workflowCashSuiteIndexes=Object.freeze([3])
export const workflowCashPriorAllocations=Object.freeze(['76','12'])
export const workflowCashCurrentRunBudgets=Object.freeze([64,4])
export const workflowCashCumulativeBudgets=Object.freeze([140,16])
export const workflowCashEvidencePins=Object.freeze({
  "native-3dadead2-edce-47d0-be82-407f5465451e-snapshot-1.json": "f05bfddfa029760f2a59e59fec988a5ce9c8b6ccaa696316b8a24da61dbb20f2",
  "native-3dadead2-edce-47d0-be82-407f5465451e-all-sequences-1.json": "bdc1288ee0c8514bfa18bffe7576b4a3a91e02b5b175bab1e0bcc5a7b618d019",
  "native-3dadead2-edce-47d0-be82-407f5465451e-snapshot-4.json": "acfb58821eb874f8acfcc0fc938d4afd3af3e1507c3b7283ef5f4a8ea68c6bdb",
  "native-3dadead2-edce-47d0-be82-407f5465451e-all-sequences-4.json": "585cff1d80fb4b244506e176b09b0a5f593750db66bb4101145aff6387d9a915",
  "native-3dadead2-edce-47d0-be82-407f5465451e-snapshot-5.json": "ff8b9fa7065ad1e4eed824160a053e1a1af43334bd9a36eed648b08e243b6dab",
  "native-3dadead2-edce-47d0-be82-407f5465451e-all-sequences-5.json": "bd2eff887ef79a095ffaa67a496294e14b4d666c385cd29c8ddc01ffad7b307a",
  "native-3dadead2-edce-47d0-be82-407f5465451e-tap-1.json": "46a0c8e6634f8f535e18d40ec6e8d2ce16e90612a077fdd3ba02cd7c43a4be7e",
  "native-3dadead2-edce-47d0-be82-407f5465451e-receipt-1.json": "0b8fcaa024cc02cdfce63a42de019aed064a43007cf51ae3bde5ee5bb980cb17",
  "native-3dadead2-edce-47d0-be82-407f5465451e-closure-1.json": "322ea21a8e7b204899c6073373e664522c73b46c6b74546ad9a56017c07e07d9",
  "native-3dadead2-edce-47d0-be82-407f5465451e-tap-2.json": "afc59b448b4ffbf345a5798de160dbf50785d8004e97fd12e5f15c917fb9f541",
  "native-3dadead2-edce-47d0-be82-407f5465451e-receipt-2.json": "dc1f3cdeb8bc4dd28452524445d4e22ffe3df43c621ba954fe0fe9ecaf766cbf",
  "native-3dadead2-edce-47d0-be82-407f5465451e-closure-2.json": "2a7b6e1e692c364d662b61b5273efdfc7f82e1d050988c136032fca358d76cca",
  "native-3dadead2-edce-47d0-be82-407f5465451e-snapshot-2.json": "458dc541faf17794f6e226fb604b9e431f87ed61697f09c87eaf297c183f2434",
  "native-3dadead2-edce-47d0-be82-407f5465451e-all-sequences-2.json": "61b4c0fb18e070d7a10894142a2cb71f3556db903dc27d6bed6937fc18707352",
  "native-3dadead2-edce-47d0-be82-407f5465451e-snapshot-3.json": "d81278106f3f340a8606061e8d7e5b2ff0150eabea379688a948be226a9a9846",
  "native-3dadead2-edce-47d0-be82-407f5465451e-all-sequences-3.json": "9f532aafdf4e5729fd82b75185623be8c05714723691d8487c9b23ead7454f53",
  "maintenance-baseline-one63-partial-independent-proof.json": "be2099cd975a4630bdf3f606404cf1a9537a23986efe25f2a0d5af3ff7270ec1",
  "maintenance-baseline-partial-retained-review.json": "1ece8ec85ffe03ab879bdb9685bf5d2a31ae82b08fcae96e05dca7aa708d8d98",
  "maintenance-baseline-final-read-only-cleanup-proof.json": "1f5e33f6fcf0510dbe31c3d0faf575f7e4098455a2ff387a822f9a8da3f000b5",
  "maintenance-baseline-frozen-preview.json": "c5f86db53ae4c3ca3a5cead7ec4e197533ffaac7d49c6ab6a9c50547fc317860",
  "native-retry-0a8c84d6bef7d2a2eb125533c63703947c0f48e788b658473733c3b438c01e03.started.json": "380b349b5c6034a333203b018a5563ddc26c9f1459061b332688330a68f87cb8",
  "cash22-user-authorization.json": "f9e8f7b47d74de9a8e61dded980f30df023d40704199a3b632810a2ef66aef71"
})
const directory='.superpowers/sdd/2026-10-04-document-backed-installment-approval'
const run='3dadead2-edce-47d0-be82-407f5465451e'
const manifestSha='0a8c84d6bef7d2a2eb125533c63703947c0f48e788b658473733c3b438c01e03'
const fail=()=>{throw Error('WORKFLOW_REHEARSAL_CASH_EVIDENCE_CHANGED')}
const check=ok=>{if(!ok)fail()}
export function workflowCashCumulative(current){
 if(!Array.isArray(current)||current.length!==2||current.some(x=>typeof x!=='bigint'||x<0n))throw Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
 const total=current.map((x,i)=>x+BigInt(workflowCashPriorAllocations[i]))
 if(total.some((x,i)=>x>BigInt(workflowCashCumulativeBudgets[i])))throw Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
 return total
}
export function verifyWorkflowCashEvidenceFile(name,bytes){
 check(Object.hasOwn(workflowCashEvidencePins,name)&&Buffer.isBuffer(bytes)&&workflowSha(bytes)===workflowCashEvidencePins[name])
 try{return JSON.parse(bytes.toString('utf8'))}catch{fail()}
}
function assertFixedCashMaintenance(before,after){
 assertWorkflowNativeSnapshot(before);assertWorkflowNativeSnapshot(after)
 const old=before.snapshot.catalogueObjects.filter(x=>x.kind==='class'&&x.identity==='20584'),next=after.snapshot.catalogueObjects.filter(x=>x.kind==='class'&&x.identity==='20584')
 check(old.length===1&&next.length===1)
 const a=old[0],b=next[0],{relfrozenxid:af,relminmxid:am,...ax}=a.metadata,{relfrozenxid:bf,relminmxid:bm,...bx}=b.metadata
 check(a.metadata.relname==='company_memberships'&&a.metadata.relnamespace==='2200'&&af==='21989'&&bf==='22357'&&am==='7305'&&bm==='7364'&&isDeepStrictEqual(ax,bx))
 const {sha256:ah,metadata:unusedA,...ai}=a,{sha256:bh,metadata:unusedB,...bi}=b
 check(unusedA&&unusedB&&isDeepStrictEqual(ai,bi)&&ah==='5736d560f4273bf04b6907d316e137f559f4acd69c630242b9e6b93516ce5b42'&&bh==='ca5f18c31469c4818eaad07fa4c4818fd06cea69045da80e1fc90447d6d334df')
 const adjusted=structuredClone(before)
 adjusted.snapshot.catalogueObjects[adjusted.snapshot.catalogueObjects.findIndex(x=>x.kind==='class'&&x.identity==='20584')]=structuredClone(b)
 adjusted.snapshot.catalogueObjectHashesSha256=workflowSha(adjusted.snapshot.catalogueObjects.map(x=>x.sha256).join('\n'))
 adjusted.snapshot.catalogueComparableSha256=after.snapshot.catalogueComparableSha256
 check(assertWorkflowNativePostflight(adjusted,after,0,[0n,0n]).allocations.every(x=>x===0n))
}
export function readWorkflowCashProvenance(cwd,sources){
 const previous=readWorkflowRemainingProvenance(cwd,sources)
 const files=Object.fromEntries(Object.keys(workflowCashEvidencePins).map(name=>[name,verifyWorkflowCashEvidenceFile(name,readFileSync(resolve(cwd,directory,name)))]))
 const full=n=>{const raw=files['native-'+run+'-snapshot-'+n+'.json'];return {...raw,snapshot:typeof raw.snapshot==='string'?JSON.parse(raw.snapshot):raw.snapshot}}
 const all=n=>workflowAllSequenceSnapshot({rows:[files['native-'+run+'-all-sequences-'+n+'.json']]})
 const proof=files['maintenance-baseline-one63-partial-independent-proof.json'],review=files['maintenance-baseline-partial-retained-review.json'],cleanup=files['maintenance-baseline-final-read-only-cleanup-proof.json'],approval=files['cash22-user-authorization.json'],marker=files['native-retry-'+manifestSha+'.started.json'],priorManifest=files['maintenance-baseline-frozen-preview.json']
 check(proof.runId===run&&proof.manifestSha256===manifestSha&&proof.cashNeverDispatched===true&&proof.automaticReplay===false&&proof.newAssertionsPassed===41&&proof.retainedSecurityAssertionsPassed===80&&proof.oneAttemptConsumed===true)
 check(marker.runId===run&&marker.manifestSha256===manifestSha&&marker.baselineSha256===proof.baselineSha256&&priorManifest.manifestSha256===manifestSha)
 check(review.accepted===true&&review.confirmedAssertions===121&&review.cashAssertionsNotDispatched===22&&review.partialProofSha256===workflowCashEvidencePins['maintenance-baseline-one63-partial-independent-proof.json'])
 check(cleanup.readOnly===true&&cleanup.cleanupMutationAttempts===0&&cleanup.row.owned_transactions==='0'&&cleanup.row.retained_pgtap==='0')
 check(approval.approvedAt==='2026-10-06T03:56:00Z'&&approval.userReference==='Sentinel_a11c616880e48191af35ce670e73e074'&&approval.projectRef==='gtgljlnhwvhqdnwrfdfj'&&approval.exactlyOneCash22RollbackAttempt===true&&approval.completedSuitesRepeated===false&&approval.sequenceReset===false&&approval.automaticReplay===false&&approval.applyDeployProviderAllowed===false&&approval.admissionSeconds===30&&approval.transactionSeconds===150&&approval.retainedPassedAssertions===121&&approval.generalMaintenanceException===false)
 check(isDeepStrictEqual(approval.priorCumulativeAllocations,workflowCashPriorAllocations)&&isDeepStrictEqual(approval.cumulativeCeilings,workflowCashCumulativeBudgets)&&isDeepStrictEqual(approval.remainingAllocationAllowance,workflowCashCurrentRunBudgets)&&approval.cashFixtureSha256===priorManifest.suites[3].sha256)
 check(assertWorkflowNativePostflight(previous.anchorFull,full(1),0,[0n,0n]).allocations.every(x=>x===0n))
 check(assertWorkflowAllSequencePostflight(previous.anchorAll,all(1),0,[0n,0n]).allocations.every(x=>x===0n))
 let cumulative=[0n,0n]
 for(const index of [1,2]){
  const before=full(index===1?1:3),after=full(index===1?2:4),beforeAll=all(index===1?1:3),afterAll=all(index===1?2:4)
  if(index===2){
   check(assertWorkflowNativePostflight(full(2),before,0,[0n,0n]).allocations.every(x=>x===0n))
   check(assertWorkflowAllSequencePostflight(all(2),beforeAll,0,[0n,0n]).allocations.every(x=>x===0n))
  }
  assertWorkflowAllSequenceOverlap(before,beforeAll);assertWorkflowAllSequenceOverlap(after,afterAll)
  const n=assertWorkflowNativePostflight(before,after,index,cumulative),s=assertWorkflowAllSequencePostflight(beforeAll,afterAll,index,cumulative)
  check(isDeepStrictEqual(n.allocations,s.allocations))
  const receipt=files['native-'+run+'-receipt-'+index+'.json'],closure=files['native-'+run+'-closure-'+index+'.json'],tap=files['native-'+run+'-tap-'+index+'.json']
  check(tap.rows?.length===1&&tap.rows[0].result==='C1_COST_WORKFLOW_HISTORY_CLOSED')
  const counts=assertWorkflowTapResult({rows:typeof tap.rows[0].tap_rows==='string'?JSON.parse(tap.rows[0].tap_rows):tap.rows[0].tap_rows})
  check(counts.assertions===[0,13,28][index]&&receipt.assertions===counts.assertions&&receipt.suite===sources.suites[index].name)
  check(receipt.rollbackConfirmed===true&&receipt.admissionExpired===true&&receipt.ownedTransactionAbsent===true&&receipt.unapprovedSequencesUnchanged===true&&receipt.allSequenceCount===5&&receipt.postflightSha256===n.snapshotSha256&&receipt.allSequencePostflightSha256===s.allSequenceSnapshotSha256&&isDeepStrictEqual(receipt.sequenceAllocations,n.allocations.map(String)))
  check(closure.postflightConfirmed===true&&closure.cleanup?.admissionExpired===true&&closure.cleanup?.ownedTransactionAbsent===true&&closure.allSequenceCount===5&&closure.primary===null&&closure.cleanupFailure===null&&closure.postflightFailure===null&&closure.diagnosticArchiveFailure===false&&closure.snapshotArchiveFailures?.length===0&&isDeepStrictEqual(closure.sequenceAllocations,n.allocations.map(String)))
  cumulative=n.cumulative
 }
 check(isDeepStrictEqual(cumulative,[56n,8n])&&isDeepStrictEqual(cumulative.map((x,i)=>String(x+BigInt(previous.descriptor.priorCumulativeAllocations[i]))),workflowCashPriorAllocations))
 assertFixedCashMaintenance(full(4),full(5));check(assertWorkflowAllSequencePostflight(all(4),all(5),0,[0n,0n]).allocations.every(x=>x===0n));assertWorkflowAllSequenceOverlap(full(5),all(5))
 return {anchorFull:full(5),anchorAll:all(5),descriptor:{...previous.descriptor,retainedPassedAssertions:121,completedSuiteIndexes:[0,1,2],partialRunId:run,partialManifestSha256:manifestSha,priorCumulativeAllocations:workflowCashPriorAllocations,currentRunAllowance:workflowCashCurrentRunBudgets,cumulativeCeilings:workflowCashCumulativeBudgets,evidencePins:workflowCashEvidencePins,approvedAt:approval.approvedAt,userReference:approval.userReference,postflightGuardsUnchanged:true,generalMaintenanceException:false,automaticReplay:false}}
}
