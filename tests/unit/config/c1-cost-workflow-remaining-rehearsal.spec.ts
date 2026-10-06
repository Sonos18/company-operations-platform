import {readFileSync} from 'node:fs'
import {describe,it,expect,vi,afterAll} from 'vitest'
import {createHistoricalRehearsalFixture,verifyCurrentRehearsalFixtureSources} from '../../fixtures/costs/rehearsal/historical-root.mjs'
import {readWorkflowRehearsal,reviewWorkflowRehearsal,runWorkflowRehearsal,closeOwnedWorkflowBackend} from '../../../scripts/run-c1-cost-workflow-rehearsal.mjs'
import {workflowNativeBaseline} from '../../../scripts/c1-cost-workflow-rehearsal-native.mjs'
import {workflowAllSequenceSnapshot} from '../../../scripts/c1-cost-workflow-rehearsal-all-sequences.mjs'
vi.mock('../../../scripts/run-supabase-dev.mjs',()=>({isolatedSupabaseEnvironment:vi.fn(()=>({}))}))
const directory='.superpowers/sdd/2026-10-04-document-backed-installment-approval/'
const runId='394d3595-a01d-47b1-a41f-cb3ca7bd616e'
const load=(name:string)=>JSON.parse(readFileSync(directory+name,'utf8'))
const acceptedRunId='e09929b2-462e-4d1d-94d6-1a5c2853d0f2'
const maintenanceRunId='fa3f175d-c7da-47d4-88d8-e92a4b284cfa'
const consumedRaw=load('native-'+acceptedRunId+'-snapshot-2.json'),consumedRow={...consumedRaw,snapshot:JSON.parse(consumedRaw.snapshot)}
const nativeRaw=load('native-'+maintenanceRunId+'-snapshot-1.json')
const nativeRow={...nativeRaw,snapshot:JSON.parse(nativeRaw.snapshot)}
const allRow=workflowAllSequenceSnapshot({rows:[load('native-'+maintenanceRunId+'-all-sequences-1.json')]})
const prior=load('owner-policy-full-reviewed-manifest.json')
const owner={nonce:'c1cw-11111111-1111-4111-8111-111111111111',serverTime:'2026-10-06T03:25:00Z',database:'postgres',username:'postgres'}
const fixture=createHistoricalRehearsalFixture(process.cwd())
afterAll(()=>fixture.dispose())
const sources=()=>({...readWorkflowRehearsal(fixture.root),cwd:fixture.root})
function harness(options:{ageMs?:number;prepareElapsedMs?:number;futureClock?:boolean;oldClock?:boolean;wrongIdentity?:boolean;changedState?:boolean}={}){
 let time=Date.parse(owner.serverTime),batchCount=0,audit=0,roles=0,clockTime=time
 const batchSql:string[]=[]
 const lease={assertHeld:vi.fn(),release:vi.fn(async()=>{})}
 const state=()=>{const s=structuredClone(nativeRow.snapshot);s.sequences['public.audit_events_id_seq'].lastValue=String(BigInt(s.sequences['public.audit_events_id_seq'].lastValue)+BigInt(audit));s.sequences['public.company_role_assignments_id_seq'].lastValue=String(BigInt(s.sequences['public.company_role_assignments_id_seq'].lastValue)+BigInt(roles));return s}
 const all=()=>{const x=structuredClone(allRow);x.server_time=new Date(time).toISOString();x.sequences['20603'].lastValue=String(BigInt(x.sequences['20603'].lastValue)+BigInt(audit));x.sequences['20827'].lastValue=String(BigInt(x.sequences['20827'].lastValue)+BigInt(roles));return x}
 const query=vi.fn(async(sql:string)=>{
  if(!sql.startsWith('/*c1cw-')&&sql.includes('workflow_snapshot_result'))return {rows:[{...nativeRow,snapshot:state(),server_time:new Date(time).toISOString()}]}
  if(!sql.startsWith('/*c1cw-')&&sql.includes('workflow_all_sequence_census'))return {rows:[all()]}
  if(sql.includes('workflow_admission_clock')){
   time+=options.prepareElapsedMs||0;clockTime=options.oldClock?Date.parse(owner.serverTime)-1:time+(options.futureClock?1000:0)
   return {rows:[{server_time:new Date(clockTime).toISOString(),database:options.wrongIdentity?'foreign':'postgres',username:'postgres'}]}
  }
  if(sql.startsWith('/*c1cw-')){
   batchSql.push(sql);time+=options.ageMs||0
   const seconds=Number(/interval '(\d+) seconds'/.exec(sql)?.[1])
   if(time<clockTime||time-clockTime>=seconds*1000)throw Error('WORKFLOW_REHEARSAL_ADMISSION_EXPIRED')
   if(options.changedState)throw Error('WORKFLOW_REHEARSAL_ADMISSION_STATE_CHANGED')
   const i=batchCount++,count=[13,28,22][i]!,allocation=[[20,4],[24,4],[26,4]][i]!
   audit+=allocation[0]!;roles+=allocation[1]!
   return {rows:[{tap_rows:[{tap:'1..'+count},...Array.from({length:count},(_,j)=>({tap:'ok '+(j+1)+' - synthetic remaining'}))],result:'C1_COST_WORKFLOW_HISTORY_CLOSED'}]}
  }
  if(sql.includes('pg_stat_activity')){time+=31000;return {rows:[{server_time:new Date(time).toISOString(),backends:[]}]}}
  return {rows:[]}
 })
 const f=sources(),hash=reviewWorkflowRehearsal({...f,profile:'remaining63'}).manifestSha256
 const baseline=workflowNativeBaseline(hash,{...nativeRow,server_time:owner.serverTime,allSequences:{...allRow,server_time:owner.serverTime}})
 const archive=vi.fn(),reserve=vi.fn(),target=vi.fn(),lock=vi.fn(async()=>lease)
 const execute=()=>runWorkflowRehearsal({...f,profile:'remaining63',execute:true,confirmation:hash,authorization:hash,baseline,baselineConfirmation:baseline.sha256,archiveSnapshot:archive,reserveRetry:reserve,assertTarget:target,query,acquireLock:lock,delay:vi.fn(async()=>{}),nonceFactory:()=>owner.nonce})
 return {execute,query,archive,lease,reserve,lock,target,batchSql,batchCount:()=>batchCount}
}
describe('closed remaining63 proposal',()=>{
 it('accepts only the pinned maintenance-only baseline transition',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs')
  const raw=load('native-fa3f175d-c7da-47d4-88d8-e92a4b284cfa-snapshot-1.json'),after={...raw,snapshot:JSON.parse(raw.snapshot)}
  expect(()=>m.assertWorkflowRemainingMaintenanceTransition(consumedRow,after)).not.toThrow()
 })
 it('rejects permissions and any further maintenance advance outside the fixed transition',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs')
  const raw=load('native-fa3f175d-c7da-47d4-88d8-e92a4b284cfa-snapshot-1.json'),after={...raw,snapshot:JSON.parse(raw.snapshot)}
  for(const field of ['relacl','relowner','relfrozenxid','relminmxid']){
   const changed=structuredClone(after),object=changed.snapshot.catalogueObjects.find((x:{identity:string;kind:string})=>x.kind==='class'&&x.identity==='20808')
   object.metadata[field]=field==='relacl'?[]:'99999'
   expect(()=>m.assertWorkflowRemainingMaintenanceTransition(consumedRow,changed)).toThrow()
  }
  const changed=structuredClone(after);changed.snapshot.tables['public.role_permissions'].sha256='0'.repeat(64)
  expect(()=>m.assertWorkflowRemainingMaintenanceTransition(consumedRow,changed)).toThrow()
 })

 it('retains spent allocations rather than resetting the retry ledger',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs')
  expect(m.workflowRemainingCumulative([0n,0n])).toEqual([20n,4n])
  expect(m.workflowRemainingCumulative([120n,12n])).toEqual([140n,16n])
 })
 it('enforces both cumulative ceilings against extra or malformed allocations',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs')
  for(const delta of [[121n,12n],[120n,13n],[-1n,0n],[0,0],[0n]])expect(()=>m.workflowRemainingCumulative(delta)).toThrow('SEQUENCE_BUDGET')
 })
 it('rejects changed consumed retry evidence before baseline acceptance',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs'),name='native-'+acceptedRunId+'-closure-1.json',bytes=readFileSync(directory+name)
  expect(()=>m.verifyWorkflowRemainingRetryEvidenceFile(name,bytes)).not.toThrow()
  expect(()=>m.verifyWorkflowRemainingRetryEvidenceFile(name,Buffer.concat([bytes,Buffer.from(' ')]))).toThrow('RETRY_EVIDENCE_CHANGED')
  expect(()=>m.verifyWorkflowRemainingRetryEvidenceFile('unapproved.json',bytes)).toThrow('RETRY_EVIDENCE_CHANGED')
 })
 it('rejects the pre-consumption accepted Auth state as a retry starting state',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs'),p=m.readWorkflowRemainingProvenance(fixture.root,sources()),id='801718df-7a7d-450b-ae93-735383e28ecd',raw=load('native-'+id+'-snapshot-1.json')
  const old={...raw,snapshot:JSON.parse(raw.snapshot),allSequences:workflowAllSequenceSnapshot({rows:[load('native-'+id+'-all-sequences-1.json')]})}
  expect(()=>m.assertWorkflowRemainingBaseline(old,p)).toThrow()
 })

 it('binds the approved exact auth transition without replacing the prior80 evidence',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs'),p=m.readWorkflowRemainingProvenance(fixture.root,sources())
  expect(p.descriptor.completedSuite.assertions).toBe(80);expect(Object.keys(p.descriptor.evidencePins)).toHaveLength(11)
  expect(p.descriptor.acceptedBaselineTransition).toMatchObject({observedReadOnlyRunId:'801718df-7a7d-450b-ae93-735383e28ecd',approvedAt:'2026-10-06T02:05:00Z',authExemption:false,sequenceReset:false})
  expect(p.retainedAnchorFull.snapshot.sequences['auth.refresh_tokens_id_seq'].lastValue).toBe('283')
  expect(p.anchorFull.snapshot.sequences['auth.refresh_tokens_id_seq'].lastValue).toBe('284')
  expect(p.descriptor.priorCumulativeAllocations).toEqual(['20','4']);expect(p.descriptor.correctedRetry).toMatchObject({approvedAt:'2026-10-06T03:05:00Z',priorConsumedRunId:acceptedRunId,cumulativeCeilings:[140,16],sequenceReset:false})
 })
 it('rejects changed or absent exact accepted capture bytes without an arbitrary anchor',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs'),name='native-801718df-7a7d-450b-ae93-735383e28ecd-snapshot-1.json',bytes=readFileSync(directory+name)
  expect(()=>m.verifyWorkflowRemainingAcceptedBaselineFile(name,bytes)).not.toThrow()
  expect(()=>m.verifyWorkflowRemainingAcceptedBaselineFile(name,Buffer.concat([bytes,Buffer.from(' ')]))).toThrow('ACCEPTED_BASELINE_CHANGED')
  expect(()=>m.verifyWorkflowRemainingAcceptedBaselineFile(name,undefined)).toThrow('ACCEPTED_BASELINE_CHANGED')
  expect(()=>m.verifyWorkflowRemainingAcceptedBaselineFile('unapproved.json',bytes)).toThrow('ACCEPTED_BASELINE_CHANGED')
 })
 it('rejects the superseded auth state rather than accepting either old or new baseline',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs'),p=m.readWorkflowRemainingProvenance(fixture.root,sources()),raw=load('native-'+runId+'-snapshot-4.json'),old={...raw,snapshot:JSON.parse(raw.snapshot),allSequences:workflowAllSequenceSnapshot({rows:[load('native-'+runId+'-all-sequences-4.json')]})}
  expect(()=>m.assertWorkflowRemainingBaseline(old,p)).toThrow('POSTFLIGHT_DRIFT')
 })

 it('previews exact13+28+22 and pinned prior80 with no database/lock/target lookup',async()=>{
  const query=vi.fn(),acquireLock=vi.fn(),assertTarget=vi.fn(),m=await runWorkflowRehearsal({...sources(),profile:'remaining63',query,acquireLock,assertTarget})
  expect(m.schemaVersion).toBe(10);expect(m.executionSuites.map((x:{index:number})=>x.index)).toEqual([1,2,3]);expect(m.executionSuites.map((x:{assertions:number})=>x.assertions)).toEqual([13,28,22]);expect(m.executedAssertionCount).toBe(63);expect(m.pgTapSetup.installations).toBe(3);expect(m.retainedSecurity.completedSuite.assertions).toBe(80);expect(m.retainedSecurity.previousRunId).toBe(runId)
  expect(m.migrations).toEqual(prior.migrations);expect(m.executionSuites.map((x:{sha256:string})=>x.sha256)).toEqual(['26dab156ff3b530f4814018cfbc2fd4c2a4926024fdd19427269c9c9d2bee5e1','9193e5b4d6593ef532bf47ea42ec910a3def107d334362942ee63538998eb8e0','cd7ef087b1c69ecef4f878404a7cab48539bb99914bd3b8ef2850a3625fbe9ec'])
  expect(m.nativeAdmissionPolicy).toMatchObject({freshClockAfterPreparation:true,originalSnapshotRetained:true,windowSeconds:30,transactionSeconds:150})
  expect(m.timeouts).toEqual({...prior.timeouts,admissionSeconds:30});expect(m.sequenceException).toEqual({...prior.sequenceException,total:[140,16],priorCumulativeAllocations:['20','4'],currentRunTotal:[120,12]});expect(m.allSequencePolicy.total).toEqual([120,12]);expect(m.nativeSnapshotSqlSha256).toBe(prior.nativeSnapshotSqlSha256);expect(m.snapshotOutputAllowance).toEqual(prior.snapshotOutputAllowance)
  expect(query).not.toHaveBeenCalled();expect(acquireLock).not.toHaveBeenCalled();expect(assertTarget).not.toHaveBeenCalled()
 })
 it('rejects unknown profile and changed fixture bytes before target or credentials',async()=>{
  const target=vi.fn(),query=vi.fn();await expect(runWorkflowRehearsal({...sources(),profile:'remaining64',assertTarget:target,query})).rejects.toThrow('PROFILE_INVALID')
  const f=sources();f.suites[1]!.sql=f.suites[1]!.sql.replace('rollback;','-- changed fixture\nrollback;');await expect(runWorkflowRehearsal({...f,profile:'remaining63',assertTarget:target,query})).rejects.toThrow('PRIOR_SOURCE_CHANGED');expect(target).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled()
 })
 it('rejects changed or missing evidence bytes against fixed SHA pins',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs')
  const name='native-'+runId+'-receipt-0.json',bytes=readFileSync(directory+name)
  expect(()=>m.verifyWorkflowRemainingEvidenceFile(name,bytes)).not.toThrow()
  expect(()=>m.verifyWorkflowRemainingEvidenceFile(name,Buffer.concat([bytes,Buffer.from(' ') ]))).toThrow('PRIOR_EVIDENCE_CHANGED')
  expect(()=>m.verifyWorkflowRemainingEvidenceFile(name,undefined)).toThrow('PRIOR_EVIDENCE_CHANGED')
 })
 it('executes only three original suites with original per-index budgets and seven full+census captures',async()=>{
  const h=harness(),result=await h.execute()
  expect(h.batchCount()).toBe(3);expect(result.receipts.map((x:{assertions:number})=>x.assertions)).toEqual([13,28,22]);expect(result.sequenceAllocations).toEqual(['70','12']);expect(result.cumulativeSequenceAllocations).toEqual(['90','16']);expect(result.priorCumulativeSequenceAllocations).toEqual(['20','4']);expect(result.snapshotCount).toBe(7);expect(result.allSequenceSnapshotCount).toBe(7)
  expect(h.batchSql.every(sql=>!sql.includes('select plan(80)'))).toBe(true);expect(h.batchSql.map(sql=>Number(/select plan[(](\d+)[)]/.exec(sql)?.[1]))).toEqual([13,28,22])
  for(const [i,sql] of h.batchSql.entries()){expect(sql).toContain("interval '30 seconds'");expect(sql).toContain("transaction_timeout='150s'");expect(sql).toContain('audit '+[20,44,56][i]);expect(sql.indexOf('WORKFLOW_REHEARSAL_ADMISSION_STATE_CHANGED')).toBeLessThan(sql.indexOf('create extension pgtap'));expect(sql.indexOf('WORKFLOW_REHEARSAL_ALL_SEQUENCE_ADMISSION_CHANGED')).toBeLessThan(sql.indexOf('create extension pgtap'))}
  expect(h.reserve).toHaveBeenCalledTimes(1);expect(h.lease.release).toHaveBeenCalledTimes(1)
 })
 it('fetches fresh clock after45s preparation, never retimestamps original snapshots',async()=>{
  const h=harness({prepareElapsedMs:45000}),result=await h.execute(),calls=h.query.mock.calls.map(([sql])=>sql),clockIndex=calls.findIndex(sql=>sql.includes('workflow_admission_clock'))
  expect(calls[clockIndex+1]).toMatch(/^\/\*c1cw-/);expect(h.batchSql[0]).toContain("'2026-10-06T03:25:45.000Z'::timestamptz");expect(result.receipts).toHaveLength(3)
  const archived=h.archive.mock.calls.find(([,label])=>label==='snapshot-1')?.[0] as {server_time:string}
  expect(archived.server_time).toBe(owner.serverTime.replace('Z','.000Z'))
 })
 it('allows a29.999s observed age under proposed30s SQL guard',async()=>{const h=harness({ageMs:29999});expect((await h.execute()).receipts).toHaveLength(3)})
 it.each([{ageMs:30000},{ageMs:31000},{futureClock:true}])('rejects invalid admission age %j without DML or replay and still postflights',async(options)=>{
  const h=harness(options);await expect(h.execute()).rejects.toThrow('ADMISSION_EXPIRED');expect(h.batchCount()).toBe(0);expect(h.batchSql).toHaveLength(1)
  const labels=h.archive.mock.calls.map(([,label])=>label);expect(labels).toContain('snapshot-2');expect(labels).toContain('all-sequences-2');expect(labels).toContain('closure-1');expect(h.lease.release).toHaveBeenCalledTimes(1)
 })
 it.each([{oldClock:true},{wrongIdentity:true}])('rejects wrong clock %j before dispatch',async(options)=>{const h=harness(options);await expect(h.execute()).rejects.toThrow('ADMISSION_CLOCK');expect(h.batchSql).toHaveLength(0);expect(h.lease.release).toHaveBeenCalledTimes(1)})
 it('retains full intx state rejection after a fresh clock and blocks following suites',async()=>{const h=harness({changedState:true});await expect(h.execute()).rejects.toThrow('ADMISSION_STATE_CHANGED');expect(h.batchCount()).toBe(0);expect(h.batchSql).toHaveLength(1);expect(h.archive.mock.calls.map(([,label])=>label)).toContain('closure-1')})
 it('waits past30s and refuses unsupported cleanup windows',async()=>{
  let calls=0;const ages=[10000,29999,30000],query=vi.fn(async()=>({rows:[{server_time:new Date(Date.parse(owner.serverTime)+ages[calls++]!).toISOString(),backends:[]}]}))
  await expect(closeOwnedWorkflowBackend({query,owner,admissionSeconds:30,delay:vi.fn(async()=>{})})).resolves.toEqual({admissionExpired:true,ownedTransactionAbsent:true});expect(query).toHaveBeenCalledTimes(3)
  await expect(closeOwnedWorkflowBackend({query,owner,admissionSeconds:31,delay:vi.fn(async()=>{})})).rejects.toThrow('PROFILE_INVALID')
 })
 it('rejects changed original state even when its timestamp is made newer',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs'),prior=m.readWorkflowRemainingProvenance(fixture.root,sources())
  const row={...structuredClone(nativeRow),server_time:'2026-10-06T03:20:00Z',allSequences:{...structuredClone(allRow),server_time:'2026-10-06T03:20:00Z'}}
  const key=Object.keys(row.snapshot.tables)[0]!;row.snapshot.tables[key].sha256='c'.repeat(64)
  expect(()=>m.assertWorkflowRemainingBaseline(row,prior)).toThrow('DRIFT')
 })
 it('rejects a fresh baseline with any nonbudget sequence change',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs'),prior=m.readWorkflowRemainingProvenance(fixture.root,sources())
  const row={...structuredClone(nativeRow),allSequences:structuredClone(allRow)};row.allSequences.sequences['17263'].lastValue='2';row.allSequences.sequences['17263'].isCalled=true
  expect(()=>m.assertWorkflowRemainingBaseline(row,prior)).toThrow('UNAPPROVED_SEQUENCE_CHANGE')
 })
 it('preserves the full143 default10s admission',()=>{const m=reviewWorkflowRehearsal(sources());expect(m.nativeAdmissionPolicy.windowSeconds).toBe(10);expect(m.timeouts.admissionSeconds).toBe(10);expect(m.suites.map((x:{assertions:number})=>x.assertions)).toEqual([80,13,28,22])})
 it('current source cannot reuse historical admission before target, query, lock or retry reserve',async()=>{
  const assertTarget=vi.fn(),query=vi.fn(),acquireLock=vi.fn(),reserveRetry=vi.fn()
  await expect(runWorkflowRehearsal({...readWorkflowRehearsal(process.cwd()),cwd:process.cwd(),profile:'remaining63',assertTarget,query,acquireLock,reserveRetry})).rejects.toThrow('PRIOR_SOURCE_CHANGED')
  for(const spy of [assertTarget,query,acquireLock,reserveRetry])expect(spy).not.toHaveBeenCalled()
 })
 it('current fixture pins reject altered reviewed source identities',()=>{
  const manifest=structuredClone(verifyCurrentRehearsalFixtureSources(process.cwd()))
  manifest.sources[0].currentSha256='0'.repeat(64)
  expect(()=>verifyCurrentRehearsalFixtureSources(process.cwd(),manifest)).toThrow('CURRENT_REHEARSAL_FIXTURE_SOURCE_CHANGED')
 })

})
