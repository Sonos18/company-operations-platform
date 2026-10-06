import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readWorkflowRehearsal,reviewWorkflowRehearsal,costWorkflowAssertionCounts} from './run-c1-cost-workflow-rehearsal.mjs'
import {workflowSourceRoot,workflowSha} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {workflowLinkedRoot} from './c1-cost-workflow-rehearsal-link.mjs'
import {workflowApiProject,workflowApiSnapshotSql,workflowApiTransportReview,assertWorkflowApiReady} from './c1-cost-workflow-rehearsal-api.mjs'

// This entry point publishes a source-only proposal. It never reads a CLI
// token, invokes an app, captures a baseline or executes rollback-DDL.
export function reviewWorkflowApiRehearsal({cwd=workflowSourceRoot,linkRoot=workflowLinkedRoot}={}){
 const existing=reviewWorkflowRehearsal({...readWorkflowRehearsal(cwd),cwd,linkRoot})
 const packet={
  schemaVersion:1,mode:'source-proposal',projectRef:workflowApiProject,
  operation:'proposed fresh complete baseline plus rollback-only synthetic rehearsal',
  existingManifestSha256:existing.manifestSha256,existingManifest:existing,
  transport:workflowApiTransportReview,
  snapshot:{
   sqlSha256:workflowSha(workflowApiSnapshotSql),capture:'one repeatable-read READ ONLY request',
   allOriginalCatalogueRows:true,canonicalAggregateHashUnchanged:true,
   objectMetadata:'all fields except masked role-password placeholder; function source replaced by exact digest',
   validation:'object count, row-hash-list digest and identity consistency; live complete capture pending',
   roleExpiryCompared:true,outputBytes:existing.clientLimits.outputBytes,
   archive:'retain complete before/after object metadata, row hashes, table/history hashes and sequence values',
   liveValidated:false,
  },
  baseline:{
   approvalRequired:true,accepted:false,snapshotSha256:null,
   historicalRestorationClaim:false,catalogueExpiryExemption:false,
   historicalFullPreimageAvailable:false,
   acceptanceBinding:'SHA256(JSON.stringify({proposalSha256,snapshotSha256}))',
   firstExecutionSnapshotMustEqualAcceptedBaseline:true,
  },
  retry:{
   authorized:false,enabled:false,oneTransactionPerSuite:true,
   assertions:costWorkflowAssertionCounts.reduce((total,n)=>total+n,0),
   perSuiteAssertions:costWorkflowAssertionCounts,
   retainEveryAssertionPlanAndFinishDiagnostic:true,
   timeoutLimits:existing.timeouts,clientLimits:existing.clientLimits,
   sequenceException:existing.sequenceException,lock:existing.lock,
   exactCatalogueEquality:true,expiryExemption:false,
   cleanupIdentity:['nonce','pid','backendStart','database','username','transactionStart','queryPrefix'],
   rollbackReceipt:'only after trailing ROLLBACK success, owned transaction absence and exact fresh postflight',
   noAutomaticReplay:true,noFallback:true,
   authorizationBinding:'SHA256(JSON.stringify({proposalSha256,acceptedBaselineSnapshotSha256}))',
  },
  priorEvidence:{
   originalFailedManifestSha256:'9895a8bce62f4582313fa1981ed3b6e18d1814e50caaccb0f3def95d047d5bfa',
   sqlstate:'42601',message:'syntax error at end of input',
   failureTimestamp:'2026-10-05T11:25:40.784Z',phase:'sequence guard before pgTAP setup/migrations/fixtures',
   actualAssertionsExecuted:0,plannedAssertions:143,
   laterCatalogueObjectsCompared:8148,laterOnlyChangedObject:'role:17487 cli_login_postgres',
   laterOnlyChangedField:'rolvaliduntil',
   apiReadStability:'two READ ONLY API reads retained identical role metadata hash and expiry; no_write_xid=true',
   originalHistoricalDriftFullyAttributed:false,
  },
  riskChange:{
   clientPromiseDeadlineIsNotSqlCancellation:true,providerDeadlineOrReplayContractUnverified:true,
   singleBackendAndExactBatchQueryUnverified:true,independentCleanupAvailabilityUnverified:true,
   outputCeilingCheckedAfterToolBuffering:true,rollbackDdlToolRouteNotPermitted:true,
   existingNativeRunnerReadsCliTokenEvenWithInjectedQuery:true,
   noneOfTheseRisksAcceptedByBaselineConsent:true,
  },
  activation:{
   status:'blocked',executionConsentRequired:true,freshBaselineConsentRequired:true,
   transportGuaranteesMustBeVerified:true,
   credentialFreeDriverMustBeReviewed:true,
   persistentApplyMigrationAlternativeAllowed:false,
  },
 }
 return {...packet,manifestSha256:workflowSha(JSON.stringify(packet))}
}
export async function runWorkflowApiRehearsal(options={}){
 const packet=reviewWorkflowApiRehearsal(options)
 if(!options.execute)return packet
 if(options.confirmation!==packet.manifestSha256||options.authorization!==packet.manifestSha256)throw new Error('WORKFLOW_REHEARSAL_AUTHORIZATION_REQUIRED')
 assertWorkflowApiReady()
 throw new Error('WORKFLOW_REHEARSAL_API_DRIVER_NOT_REVIEWED')
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2)
 if(args.length)throw new Error('WORKFLOW_REHEARSAL_API_SOURCE_PROPOSAL_ONLY')
 console.log(JSON.stringify(await runWorkflowApiRehearsal(),null,2))
}
