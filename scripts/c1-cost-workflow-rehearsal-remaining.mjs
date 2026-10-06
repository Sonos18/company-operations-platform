import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {isDeepStrictEqual} from 'node:util'
import {workflowSha,readWorkflowBaseMigrations} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {workflowAdmissionSql,workflowTimeouts} from './c1-cost-workflow-rehearsal-catalog.mjs'
import {workflowNativeAdmissionPolicy,assertWorkflowNativeSnapshot,assertWorkflowNativePostflight} from './c1-cost-workflow-rehearsal-native.mjs'
import {workflowAllSequenceSnapshot,assertWorkflowAllSequencePostflight,assertWorkflowAllSequenceOverlap} from './c1-cost-workflow-rehearsal-all-sequences.mjs'
import {assertWorkflowTapResult} from './run-c1-cost-workflow-tests.mjs'
export const workflowRemainingSuiteIndexes=Object.freeze([1,2,3])
export const workflowRemainingTimeouts=Object.freeze({...workflowTimeouts,admissionSeconds:30})
export const workflowRemainingAdmissionPolicy=Object.freeze({...workflowNativeAdmissionPolicy,windowSeconds:30})
export const workflowRemainingPriorAllocations=Object.freeze(['20','4'])
export const workflowRemainingCumulativeBudgets=Object.freeze([140,16])
export const workflowRemainingCorrectedFixturePins=Object.freeze({
 'c1_cost_workflow_evidence.test.sql':'26dab156ff3b530f4814018cfbc2fd4c2a4926024fdd19427269c9c9d2bee5e1',
 'c1_cost_workflow_requests.test.sql':'9193e5b4d6593ef532bf47ea42ec910a3def107d334362942ee63538998eb8e0',
 'c1_cost_workflow_cash.test.sql':'cd7ef087b1c69ecef4f878404a7cab48539bb99914bd3b8ef2850a3625fbe9ec'
})
export const workflowRemainingRetryEvidencePins=Object.freeze({
  "native-e09929b2-462e-4d1d-94d6-1a5c2853d0f2-snapshot-2.json": "d3d3f59f54a32c6411b40a5d021c81fade0861f200771bc4dfdbe4fbae30f4ea",
  "native-e09929b2-462e-4d1d-94d6-1a5c2853d0f2-all-sequences-2.json": "55557f4f533af08e76aee196d4491902363a179eedd9fb76aa81fe434a4a4b58",
  "native-e09929b2-462e-4d1d-94d6-1a5c2853d0f2-closure-1.json": "c63c104ce36a09c2f041d54a1e3a9c24c84d0420eb870f18c53eee19b0816994",
  "native-retry-0719cb4d4884d8b08b8cd3218e478971671bd651c70ba81b8cb1e9268c0e91ad.started.json": "ee280b72936da312ae2d63b24ea815a6ef647bd26e826dd620e86cc32e01a66c",
  "accepted-auth-remaining63-failure-independent-proof.json": "b221201d79a234ff5a7810fe3d549a0cfc3b554f35b9309567aadba7d9dd90af",
  "accepted-auth-remaining63-final-read-only-cleanup-proof.json": "57ee7430b988a28b63369ef89e92385f3eea88f7deb1daa5b8522251d0e36aa4",
  "fixture-schema-fix.patch": "112b4c7c1f8adbb164c78ed26352316104764f6bed9ed74413c8ee279d8b6ad6",
  "corrected-retry-user-authorization.json": "0148e0871cb1bd17e811e90074a2beded069149209136525f594b98034de5242"
})
export function workflowRemainingCumulative(currentRun){
 if(!Array.isArray(currentRun)||currentRun.length!==2||currentRun.some(n=>typeof n!=='bigint'||n<0n))throw Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
 const total=currentRun.map((n,i)=>n+BigInt(workflowRemainingPriorAllocations[i]))
 if(total.some((n,i)=>n>BigInt(workflowRemainingCumulativeBudgets[i])))throw Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
 return total
}
export function verifyWorkflowRemainingRetryEvidenceFile(name,bytes){
 if(!Object.hasOwn(workflowRemainingRetryEvidencePins,name)||!Buffer.isBuffer(bytes)||workflowSha(bytes)!==workflowRemainingRetryEvidencePins[name])throw Error('WORKFLOW_REHEARSAL_RETRY_EVIDENCE_CHANGED')
 if(name.endsWith('.patch'))return {sha256:workflowSha(bytes)}
 try{return JSON.parse(bytes.toString('utf8'))}catch{throw Error('WORKFLOW_REHEARSAL_RETRY_EVIDENCE_CHANGED')}
}
export const workflowRemainingEvidencePins=Object.freeze({
 "owner-policy-full-reviewed-manifest.json": "b15952fbec9d3e3f00a7f4f941eaaa6b52b59b06f2325ef193ecd2664df2c6c2",
 "native-retry-9b4739af1b2dc1dc03ec0744a04cf2e98e41cf19bf80c572e05bf6e09e55a850.started.json": "7ddc513e5dc0a56784b7ba0656255b243b30c62661cd823a7911c0f487bdffd1",
 "native-394d3595-a01d-47b1-a41f-cb3ca7bd616e-tap-0.json": "29a46f9560cf918d3291b5e567bc0ee4bc00c3a1aa57e61dcc37892d57d0acac",
 "native-394d3595-a01d-47b1-a41f-cb3ca7bd616e-receipt-0.json": "145e56d482eaeb35e3c81d7e2b8ca52b8fde32eddfbd7362620fa9248830b269",
 "native-394d3595-a01d-47b1-a41f-cb3ca7bd616e-closure-0.json": "66a9f8b357ad073b2242f44ab848878d73d6cc2bba9cc4b474efcacf2e4f336d",
 "native-394d3595-a01d-47b1-a41f-cb3ca7bd616e-closure-1.json": "d05b53da1b38c7b5fc7f16b6485991ad5184c577c4b801903fe60f5388024b7d",
 "native-394d3595-a01d-47b1-a41f-cb3ca7bd616e-snapshot-4.json": "5a0b9f73bf9ac14c0873da9129d70ab7fdac64ba60c61164d7b75ba371c495bf",
 "native-394d3595-a01d-47b1-a41f-cb3ca7bd616e-all-sequences-4.json": "5cb85a5e29217d22ad46e752ed38a622c6c6eb9c3c6ecbfc6ce24b843a1e3eb2",
 "owner-policy-approved-full-failure-independent-proof.json": "bc8826ac67c42be98a1e4e7dae4021ae941eb8c4e94358e8a2ba3cf5fafbb440",
 "owner-policy-approved-full-read-only-cleanup-proof.json": "b88d25e3f8129f0d8f415268e1f4e2a24699039a3186810d833c004bdc16ea7a",
 "owner-policy-approved-full-retained-evidence-review.json": "50466fa8d522b72d1cc3b659bc58f6e19cc05d3bf5c1742177dee9c534f42e9b"
})
const directory='.superpowers/sdd/2026-10-04-document-backed-installment-approval'
const priorRunId='394d3595-a01d-47b1-a41f-cb3ca7bd616e',priorManifestSha256='9b4739af1b2dc1dc03ec0744a04cf2e98e41cf19bf80c572e05bf6e09e55a850',priorBaselineSha256='e78a8f38124b9f1329bbc93ce1636ecc0cc95023207408cc4572adbe9781b7fc'
const nativeName=label=>'native-'+priorRunId+'-'+label+'.json'
export function verifyWorkflowRemainingEvidenceFile(name,bytes){
 if(!Object.hasOwn(workflowRemainingEvidencePins,name)||!Buffer.isBuffer(bytes)||workflowSha(bytes)!==workflowRemainingEvidencePins[name])throw Error('WORKFLOW_REHEARSAL_PRIOR_EVIDENCE_CHANGED')
 try{return JSON.parse(bytes.toString('utf8'))}catch{throw Error('WORKFLOW_REHEARSAL_PRIOR_EVIDENCE_CHANGED')}
}
// Explicitly approved transition to one immutable, diagnosed starting state.
// This is not a runtime Auth exemption: every later before/after check is exact.
export const workflowRemainingAcceptedBaselinePins=Object.freeze({
 "native-801718df-7a7d-450b-ae93-735383e28ecd-snapshot-1.json": "fecf32525fee6cd5de473d5389426a9a0684644492884124e3daf3fbb897ca46",
 "native-801718df-7a7d-450b-ae93-735383e28ecd-all-sequences-1.json": "44f8104fc95a091b163b4487a0ac0ae39b862a7bd6153905d1311ca2a25c3101",
 "remaining63-baseline-safe-drift-proof.json": "7ee2c5cf47847674b9da68d177662dbf851a031f4144a5257d8dd8f08ad7c1ed",
 "remaining63-auth-safe-log-timeline.json": "d52059b3f3ddc392f5188903b24e7652b226bd2dcf057685f70da7fbdaed9159",
 "accepted-auth-baseline-user-authorization.json": "1367f1ac0976e88c6d08a64c918212b5f8a50e47428623c49411f0bffaeffda5"
})
export function verifyWorkflowRemainingAcceptedBaselineFile(name,bytes){
 if(!Object.hasOwn(workflowRemainingAcceptedBaselinePins,name)||!Buffer.isBuffer(bytes)||workflowSha(bytes)!==workflowRemainingAcceptedBaselinePins[name])throw Error('WORKFLOW_REHEARSAL_ACCEPTED_BASELINE_CHANGED')
 try{return JSON.parse(bytes.toString('utf8'))}catch{throw Error('WORKFLOW_REHEARSAL_ACCEPTED_BASELINE_CHANGED')}
}
function readWorkflowRemainingAcceptedBaseline(cwd){
 const files=Object.fromEntries(Object.keys(workflowRemainingAcceptedBaselinePins).map(name=>{
  let bytes;try{bytes=readFileSync(resolve(cwd,directory,name))}catch{throw Error('WORKFLOW_REHEARSAL_ACCEPTED_BASELINE_CHANGED')}
  return [name,verifyWorkflowRemainingAcceptedBaselineFile(name,bytes)]
 }))
 const run='801718df-7a7d-450b-ae93-735383e28ecd',raw=files['native-'+run+'-snapshot-1.json'],anchorFull={...raw,snapshot:typeof raw.snapshot==='string'?JSON.parse(raw.snapshot):raw.snapshot},anchorAll=workflowAllSequenceSnapshot({rows:[files['native-'+run+'-all-sequences-1.json']]}),approval=files['accepted-auth-baseline-user-authorization.json'],proof=files['remaining63-baseline-safe-drift-proof.json']
 assertWorkflowNativeSnapshot(anchorFull);assertWorkflowAllSequenceOverlap(anchorFull,anchorAll)
 if(approval.approvedAt!=='2026-10-06T02:05:00Z'||approval.userReference!=='Sentinel_9b2a02807ce48191b1382c71278a4d9c'||approval.noGeneralAuthExemption!==true||approval.noAuthDisableDeleteReset!==true||proof.readOnlyBaselineRun!==run||proof.priorRun!==priorRunId||proof.newMutationAttempts!==0)throw Error('WORKFLOW_REHEARSAL_ACCEPTED_BASELINE_CHANGED')
 return {anchorFull,anchorAll,descriptor:{approvedAt:approval.approvedAt,userReference:approval.userReference,observedReadOnlyRunId:run,priorRunId,fullSnapshotSha256:workflowRemainingAcceptedBaselinePins['native-'+run+'-snapshot-1.json'],allSequenceSnapshotSha256:workflowRemainingAcceptedBaselinePins['native-'+run+'-all-sequences-1.json'],evidencePins:workflowRemainingAcceptedBaselinePins,observedAuthRefreshDelta:'283-to-284',priorAuditRoleAllocations:['0','0'],authExemption:false,sequenceReset:false}}
}

function readWorkflowRemainingRetryAnchor(cwd,accepted){
 const files=Object.fromEntries(Object.keys(workflowRemainingRetryEvidencePins).map(name=>{
  let bytes;try{bytes=readFileSync(resolve(cwd,directory,name))}catch{throw Error('WORKFLOW_REHEARSAL_RETRY_EVIDENCE_CHANGED')}
  return [name,verifyWorkflowRemainingRetryEvidenceFile(name,bytes)]
 }))
 const run='e09929b2-462e-4d1d-94d6-1a5c2853d0f2',hash='0719cb4d4884d8b08b8cd3218e478971671bd651c70ba81b8cb1e9268c0e91ad',raw=files['native-'+run+'-snapshot-2.json'],anchorFull={...raw,snapshot:typeof raw.snapshot==='string'?JSON.parse(raw.snapshot):raw.snapshot},anchorAll=workflowAllSequenceSnapshot({rows:[files['native-'+run+'-all-sequences-2.json']]}),proof=files['accepted-auth-remaining63-failure-independent-proof.json'],closure=files['native-'+run+'-closure-1.json'],marker=files['native-retry-'+hash+'.started.json'],cleanup=files['accepted-auth-remaining63-final-read-only-cleanup-proof.json'],approval=files['corrected-retry-user-authorization.json']
 const check=ok=>{if(!ok)throw Error('WORKFLOW_REHEARSAL_RETRY_EVIDENCE_CHANGED')}
 check(marker.runId===run&&marker.manifestSha256===hash&&marker.baselineSha256===proof.acceptedBaselineSha256&&proof.runId===run&&proof.manifestSha256===hash&&proof.newAuthorizationConsumed===true&&proof.automaticReplay===false&&proof.confirmedPriorAssertions===80&&proof.confirmedNewAssertions===0&&proof.primaryServerError?.sqlstate==='42703'&&proof.primaryServerError?.relation==='business_parties'&&proof.primaryServerError?.missing_column==='updated_by')
 check(isDeepStrictEqual(proof.actualAuditRoleAllocations,workflowRemainingPriorAllocations)&&isDeepStrictEqual(proof.cumulativeAuditRoleAllocations,workflowRemainingPriorAllocations)&&proof.cumulativeBudgetReset===false&&proof.postflightConfirmed===true&&proof.ownedTransactionAbsent===true&&proof.allSequenceCount===5)
 check(isDeepStrictEqual(closure.sequenceAllocations,workflowRemainingPriorAllocations)&&closure.cleanup?.admissionExpired===true&&closure.cleanup?.ownedTransactionAbsent===true&&closure.postflightConfirmed===true&&closure.allSequenceCount===5&&closure.cleanupFailure===null&&closure.postflightFailure===null&&closure.diagnosticArchiveFailure===false&&closure.snapshotArchiveFailures?.length===0)
 check(cleanup.readOnly===true&&cleanup.newMutationAttempts===0&&cleanup.manifestSha256===hash&&cleanup.row?.retained_pgtap==='0'&&cleanup.row?.owned_transactions==='0')
 check(approval.approvedAt==='2026-10-06T03:05:00Z'&&approval.userReference==='Sentinel_7efd32787d888191b59994d928046519'&&approval.exactlyOneRemaining63RollbackAttempt===true&&approval.projectRef==='gtgljlnhwvhqdnwrfdfj'&&isDeepStrictEqual(approval.priorCumulativeAllocations,workflowRemainingPriorAllocations)&&isDeepStrictEqual(approval.cumulativeCeilings,workflowRemainingCumulativeBudgets)&&isDeepStrictEqual(approval.remainingAllocationAllowance,[120,12])&&approval.fixturePatchSha256===workflowRemainingRetryEvidencePins['fixture-schema-fix.patch']&&approval.security80Repeated===false&&approval.admissionSeconds===30&&approval.transactionSeconds===150&&approval.sequenceReset===false&&approval.automaticReplay===false&&approval.infraChange===false&&approval.applyDeployProviderAllowed===false)
 assertWorkflowNativeSnapshot(anchorFull);assertWorkflowAllSequenceOverlap(anchorFull,anchorAll)
 const full=assertWorkflowNativePostflight(accepted.anchorFull,anchorFull,1,[0n,0n]),all=assertWorkflowAllSequencePostflight(accepted.anchorAll,anchorAll,1,[0n,0n])
 check(isDeepStrictEqual(full.allocations.map(String),workflowRemainingPriorAllocations)&&isDeepStrictEqual(all.allocations.map(String),workflowRemainingPriorAllocations))
 return {anchorFull,anchorAll,descriptor:{approvedAt:approval.approvedAt,userReference:approval.userReference,priorConsumedRunId:run,priorConsumedManifestSha256:hash,priorCumulativeAllocations:workflowRemainingPriorAllocations,cumulativeCeilings:workflowRemainingCumulativeBudgets,currentRunAllowance:[120,12],fixturePatchSha256:approval.fixturePatchSha256,correctedFixturePins:workflowRemainingCorrectedFixturePins,evidencePins:workflowRemainingRetryEvidencePins,authExemption:false,sequenceReset:false,automaticReplay:false}}
}

// One byte-pinned FULL baseline transition. Postflight permits no maintenance drift.
export const workflowRemainingMaintenancePins=Object.freeze({
  "native-fa3f175d-c7da-47d4-88d8-e92a4b284cfa-snapshot-1.json": "6713ed3ca4ffbf3c21f5cbc31a15c5bc4261c79dab5159a989e38795c10c4637",
  "native-fa3f175d-c7da-47d4-88d8-e92a4b284cfa-all-sequences-1.json": "f1a53d920bf801a9d6cf6e9fb0f50cfa1e490f69622cbe1b02b5698b8b74815d",
  "corrected-retry-blocked-baseline-drift-proof.json": "ffde29e674d17f3858ab8c24d11ad57881cf87d2ecb7dc029e620152d6af3729",
  "corrected-retry-blocked-baseline-independent-review.json": "6a8f76e1c73f3a0ad10f82c19fbe84a4c35a2dd1edfabf5e0047fa24cd3369bb",
  "maintenance-baseline-parent-authorization.json": "728e0b55dd609a4c2b58bfbc0d3e9655aa83b65b3340ff45edd64f130445b7e4"
})
export function assertWorkflowRemainingMaintenanceTransition(before,after){
 const fail=()=>{throw Error('WORKFLOW_REHEARSAL_MAINTENANCE_BASELINE_CHANGED')}
 assertWorkflowNativeSnapshot(before);assertWorkflowNativeSnapshot(after)
 const old=before.snapshot.catalogueObjects.filter(x=>x.kind==='class'&&x.identity==='20808'),next=after.snapshot.catalogueObjects.filter(x=>x.kind==='class'&&x.identity==='20808')
 if(old.length!==1||next.length!==1)fail()
 const a=old[0],b=next[0],{relfrozenxid:oldFrozen,relminmxid:oldMulti,...oldMetadata}=a.metadata,{relfrozenxid:newFrozen,relminmxid:newMulti,...newMetadata}=b.metadata
 if(a.metadata.relname!=='role_permissions'||a.metadata.relnamespace!=='2200'||oldFrozen!=='21940'||newFrozen!=='22304'||oldMulti!=='7217'||newMulti!=='7349'||!isDeepStrictEqual(oldMetadata,newMetadata))fail()
 const {sha256:oldHash,metadata:oldMeta,...oldIdentity}=a,{sha256:newHash,metadata:newMeta,...newIdentity}=b
 if(!isDeepStrictEqual(oldIdentity,newIdentity)||oldHash!=='859605dd19c348395503a4dbf1640c4eba013b6960f9f5703d5b4671f1eee1c5'||newHash!=='8c56199c25a1242fb9af8ef50f6a642bc13bc9f6db689bed156faed99f5f052d'||!oldMeta||!newMeta)fail()
 const adjusted=structuredClone(before)
 adjusted.snapshot.catalogueObjects[adjusted.snapshot.catalogueObjects.findIndex(x=>x.kind==='class'&&x.identity==='20808')]=structuredClone(b)
 // Rebuild the adjusted object-hash list and rebind its comparable digest;
 // native validation still compares every other full exported object, including duplicates.
 adjusted.snapshot.catalogueObjectHashesSha256=workflowSha(adjusted.snapshot.catalogueObjects.map(object=>object.sha256).join('\n'))
 adjusted.snapshot.catalogueComparableSha256=after.snapshot.catalogueComparableSha256
 const result=assertWorkflowNativePostflight(adjusted,after,0,[0n,0n])
 if(result.allocations.some(x=>x!==0n))fail()
}
function readWorkflowRemainingMaintenanceAnchor(cwd,retry){
 const files=Object.fromEntries(Object.entries(workflowRemainingMaintenancePins).map(([name,sha])=>{
  const bytes=readFileSync(resolve(cwd,directory,name))
  if(workflowSha(bytes)!==sha)throw Error('WORKFLOW_REHEARSAL_MAINTENANCE_BASELINE_CHANGED')
  return [name,JSON.parse(bytes.toString('utf8'))]
 }))
 const run='fa3f175d-c7da-47d4-88d8-e92a4b284cfa',raw=files['native-'+run+'-snapshot-1.json'],anchorFull={...raw,snapshot:typeof raw.snapshot==='string'?JSON.parse(raw.snapshot):raw.snapshot},anchorAll=workflowAllSequenceSnapshot({rows:[files['native-'+run+'-all-sequences-1.json']]}),approval=files['maintenance-baseline-parent-authorization.json'],proof=files['corrected-retry-blocked-baseline-drift-proof.json'],review=files['corrected-retry-blocked-baseline-independent-review.json']
 if(approval.fixedBaselineOnly!==true||approval.postflightGuardsUnchanged!==true||approval.generalMaintenanceException!==false||approval.automaticFixtureRetry!==false||review.acceptedRetainedProof!==true||proof.runId!==run||proof.retryMarkerExists!==false||proof.newMutationAttempts!==0||proof.tableChanges.length!==0||proof.sequenceChanges.length!==0)throw Error('WORKFLOW_REHEARSAL_MAINTENANCE_BASELINE_CHANGED')
 assertWorkflowRemainingMaintenanceTransition(retry.anchorFull,anchorFull)
 const all=assertWorkflowAllSequencePostflight(retry.anchorAll,anchorAll,0,[0n,0n])
 assertWorkflowAllSequenceOverlap(anchorFull,anchorAll)
 if(all.allocations.some(x=>x!==0n))throw Error('WORKFLOW_REHEARSAL_MAINTENANCE_BASELINE_CHANGED')
 return {anchorFull,anchorAll,descriptor:{runId:run,relation:'public.role_permissions',oid:'20808',relfrozenxid:['21940','22304'],relminmxid:['7217','7349'],evidencePins:workflowRemainingMaintenancePins,fixedBaselineOnly:true,postflightGuardsUnchanged:true,generalMaintenanceException:false}}
}


// Fixed source transition authorized with the image runtime dependency patch.
// This never relaxes SQL/state/catalogue checks or accepts an arbitrary lock.
export function verifyWorkflowRemainingApprovedImageLock(file,bytes,delivery,patch){
 return file.name==='pnpm-lock.yaml'&&file.sha256==='2854a69099d243c4008d2d6310bcf60c88c14bf85d5f6805621803d22a1e5d86'&&Buffer.isBuffer(bytes)&&workflowSha(bytes)==='70a55d1926bd318c398835cf16a752d61fa80e59b00e1dea2241cb5574d7cb96'&&Buffer.isBuffer(delivery)&&workflowSha(delivery)==='f853e63cfce2c14e4e0963718b429920341cfb2f2de2c7f057c881d3a60983bd'&&Buffer.isBuffer(patch)&&workflowSha(patch)==='e3838ed1e68327b15b73404a1cc43c3a264a8279cf28c703a17c8aee873d2953'
}

export function readWorkflowRemainingProvenance(cwd,{migrations,suites}){
 const files=Object.fromEntries(Object.keys(workflowRemainingEvidencePins).map(name=>{
  let bytes;try{bytes=readFileSync(resolve(cwd,directory,name))}catch{throw Error('WORKFLOW_REHEARSAL_PRIOR_EVIDENCE_CHANGED')}
  return [name,verifyWorkflowRemainingEvidenceFile(name,bytes)]
 }))
 const prior=files['owner-policy-full-reviewed-manifest.json'],marker=files['native-retry-'+priorManifestSha256+'.started.json'],receipt=files[nativeName('receipt-0')],closure=files[nativeName('closure-0')],failed=files[nativeName('closure-1')],proof=files['owner-policy-approved-full-failure-independent-proof.json'],cleanup=files['owner-policy-approved-full-read-only-cleanup-proof.json'],review=files['owner-policy-approved-full-retained-evidence-review.json']
 const check=(ok,code='WORKFLOW_REHEARSAL_PRIOR_EVIDENCE_CHANGED')=>{if(!ok)throw Error(code)}
 check(prior.manifestSha256===priorManifestSha256&&marker.runId===priorRunId&&marker.manifestSha256===priorManifestSha256&&marker.baselineSha256===priorBaselineSha256)
 check(isDeepStrictEqual(migrations.map(x=>({name:x.name,sha256:workflowSha(x.sql)})),prior.migrations)&&suites.length===4&&suites.every((x,i)=>x.name===prior.suites[i].name&&workflowSha(x.sql)===(i===0?prior.suites[0].sha256:workflowRemainingCorrectedFixturePins[x.name])),'WORKFLOW_REHEARSAL_PRIOR_SOURCE_CHANGED')
 check(isDeepStrictEqual(readWorkflowBaseMigrations(cwd).map(x=>({name:x.name,sha256:workflowSha(x.sql)})),prior.baseMigrations),'WORKFLOW_REHEARSAL_PRIOR_SOURCE_CHANGED')
 // Only runner orchestration and package entry point change for this proposal.
 for(const file of prior.executionSources){
  if(file.name==='scripts/run-c1-cost-workflow-rehearsal.mjs'||file.name==='package.json')continue
  const bytes=readFileSync(resolve(cwd,file.name))
  if(file.name==='pnpm-lock.yaml'&&workflowSha(bytes)!==file.sha256){
   const proofRoot='/data/remote-jobs/taskovia-ocr-image-appdeps-20261006'
   check(verifyWorkflowRemainingApprovedImageLock(file,bytes,readFileSync(resolve(proofRoot,'image-app-dependencies-delivery.json')),readFileSync(resolve(proofRoot,'image-ocr-with-app-dependencies.patch'))),'WORKFLOW_REHEARSAL_PRIOR_SOURCE_CHANGED')
   continue
  }
  check(workflowSha(bytes)===file.sha256,'WORKFLOW_REHEARSAL_PRIOR_SOURCE_CHANGED')
 }
 const tap=files[nativeName('tap-0')];check(tap.rows?.length===1&&tap.rows[0].result==='C1_COST_WORKFLOW_HISTORY_CLOSED')
 const rows=typeof tap.rows[0].tap_rows==='string'?JSON.parse(tap.rows[0].tap_rows):tap.rows[0].tap_rows
 check(assertWorkflowTapResult({rows}).assertions===80&&receipt.suite===prior.suites[0].name&&receipt.assertions===80&&receipt.rollbackConfirmed===true&&receipt.admissionExpired===true&&receipt.ownedTransactionAbsent===true&&receipt.allSequenceCount===5&&receipt.unapprovedSequencesUnchanged===true&&isDeepStrictEqual(receipt.sequenceAllocations,['0','0']))
 for(const c of [closure,failed])check(c.cleanup?.admissionExpired===true&&c.cleanup?.ownedTransactionAbsent===true&&c.postflightConfirmed===true&&c.allSequenceCount===5&&isDeepStrictEqual(c.sequenceAllocations,['0','0'])&&c.cleanupFailure===null&&c.postflightFailure===null&&c.diagnosticArchiveFailure===false&&c.snapshotArchiveFailures?.length===0)
 check(closure.primary===null&&failed.primary==='WORKFLOW_REHEARSAL_EXECUTION_FAILED:COMMAND'&&proof.runId===priorRunId&&proof.confirmedPassedAssertions===80&&proof.oneAuthorizationConsumed===true&&isDeepStrictEqual(proof.actualAllocations,['0','0'])&&cleanup.row?.retained_pgtap==='0'&&cleanup.row?.owned_transactions==='0'&&review.accepted===true&&review.proofSha256===workflowRemainingEvidencePins['owner-policy-approved-full-failure-independent-proof.json'])
 const raw=files[nativeName('snapshot-4')],anchorFull={...raw,snapshot:typeof raw.snapshot==='string'?JSON.parse(raw.snapshot):raw.snapshot},anchorAll=workflowAllSequenceSnapshot({rows:[files[nativeName('all-sequences-4')]]})
 assertWorkflowNativeSnapshot(anchorFull);assertWorkflowAllSequenceOverlap(anchorFull,anchorAll)
 const descriptor={previousRunId:priorRunId,manifestSha256:priorManifestSha256,baselineSha256:priorBaselineSha256,completedSuite:{index:0,...prior.suites[0]},TAPSha256:workflowRemainingEvidencePins[nativeName('tap-0')],receiptSha256:workflowRemainingEvidencePins[nativeName('receipt-0')],postflightProofSha256:workflowRemainingEvidencePins['owner-policy-approved-full-failure-independent-proof.json'],priorCumulativeAllocations:['0','0'],evidencePins:workflowRemainingEvidencePins,securityAssertionsRepeated:false}
 const accepted=readWorkflowRemainingAcceptedBaseline(cwd)
 const retry=readWorkflowRemainingRetryAnchor(cwd,accepted)
 const maintenance=readWorkflowRemainingMaintenanceAnchor(cwd,retry)
 return {descriptor:{...descriptor,priorCumulativeAllocations:workflowRemainingPriorAllocations,acceptedBaselineTransition:accepted.descriptor,correctedRetry:retry.descriptor,acceptedMaintenanceBaseline:maintenance.descriptor},retainedAnchorFull:anchorFull,retainedAnchorAll:anchorAll,acceptedAuthAnchorFull:accepted.anchorFull,acceptedAuthAnchorAll:accepted.anchorAll,consumedAnchorFull:retry.anchorFull,consumedAnchorAll:retry.anchorAll,anchorFull:maintenance.anchorFull,anchorAll:maintenance.anchorAll}
}
export function assertWorkflowRemainingBaseline(row,prior){
 const full=assertWorkflowNativePostflight(prior.anchorFull,row,0,[0n,0n])
 const all=assertWorkflowAllSequencePostflight(prior.anchorAll,row.allSequences,0,[0n,0n])
 assertWorkflowAllSequenceOverlap(row,row.allSequences)
 if(full.allocations.some(x=>x!==0n)||all.allocations.some(x=>x!==0n))throw Error('WORKFLOW_REHEARSAL_PRIOR_STATE_CHANGED')
}
export function workflowRemainingAdmissionSql(owner){
 const sql=workflowAdmissionSql(owner),literal="interval '10 seconds'"
 if(sql.split(literal).length!==2)throw Error('WORKFLOW_REHEARSAL_ADMISSION_SOURCE_CHANGED')
 return sql.replace(literal,"interval '30 seconds'")
}
