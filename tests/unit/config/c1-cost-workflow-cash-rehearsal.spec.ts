import {readFileSync} from 'node:fs'
import {describe,it,expect,vi,afterAll} from 'vitest'
import {createHistoricalRehearsalFixture,verifyCurrentRehearsalFixtureSources} from '../../fixtures/costs/rehearsal/historical-root.mjs'
import {readWorkflowRehearsal,reviewWorkflowRehearsal,runWorkflowRehearsal} from '../../../scripts/run-c1-cost-workflow-rehearsal.mjs'
import {workflowNativeBaseline} from '../../../scripts/c1-cost-workflow-rehearsal-native.mjs'
import {workflowAllSequenceSnapshot} from '../../../scripts/c1-cost-workflow-rehearsal-all-sequences.mjs'
vi.mock('../../../scripts/run-supabase-dev.mjs',()=>({isolatedSupabaseEnvironment:vi.fn(()=>({}))}))
const directory='.superpowers/sdd/2026-10-04-document-backed-installment-approval/'
const load=(name:string)=>JSON.parse(readFileSync(directory+name,'utf8'))
const maintenanceRunId='3dadead2-edce-47d0-be82-407f5465451e'
const nativeRaw=load('native-'+maintenanceRunId+'-snapshot-5.json')
const nativeRow={...nativeRaw,snapshot:JSON.parse(nativeRaw.snapshot)}
const allRow=workflowAllSequenceSnapshot({rows:[load('native-'+maintenanceRunId+'-all-sequences-5.json')]})
const owner={nonce:'c1cw-11111111-1111-4111-8111-111111111111',serverTime:'2026-10-06T04:30:00Z',database:'postgres',username:'postgres'}
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
   const i=batchCount++,count=[22][i]!,allocation=[[38,4]][i]!
   audit+=allocation[0]!;roles+=allocation[1]!
   return {rows:[{tap_rows:[{tap:'1..'+count},...Array.from({length:count},(_,j)=>({tap:'ok '+(j+1)+' - synthetic remaining'}))],result:'C1_COST_WORKFLOW_HISTORY_CLOSED'}]}
  }
  if(sql.includes('pg_stat_activity')){time+=31000;return {rows:[{server_time:new Date(time).toISOString(),backends:[]}]}}
  return {rows:[]}
 })
 const f=sources(),hash=reviewWorkflowRehearsal({...f,profile:'cash22'}).manifestSha256
 const baseline=workflowNativeBaseline(hash,{...nativeRow,server_time:owner.serverTime,allSequences:{...allRow,server_time:owner.serverTime}})
 const archive=vi.fn(),reserve=vi.fn(),target=vi.fn(),lock=vi.fn(async()=>lease)
 const execute=()=>runWorkflowRehearsal({...f,profile:'cash22',execute:true,confirmation:hash,authorization:hash,baseline,baselineConfirmation:baseline.sha256,archiveSnapshot:archive,reserveRetry:reserve,assertTarget:target,query,acquireLock:lock,delay:vi.fn(async()=>{}),nonceFactory:()=>owner.nonce})
 return {execute,query,archive,lease,reserve,lock,target,batchSql,batchCount:()=>batchCount}
}

describe('cash22 after retained121',()=>{
 it('previews only the remaining cash suite without DB or lock lookup',async()=>{
  const query=vi.fn(),acquireLock=vi.fn(),assertTarget=vi.fn(),m=await runWorkflowRehearsal({...sources(),profile:'cash22',query,acquireLock,assertTarget})
  expect(m.schemaVersion).toBe(11);expect(m.executionSuites.map((s:{index:number})=>s.index)).toEqual([3])
  expect(m.executedAssertionCount).toBe(22);expect(m.retainedSecurity.retainedPassedAssertions).toBe(121)
  expect(m.sequenceException.priorCumulativeAllocations).toEqual(['76','12']);expect(m.sequenceException.currentRunTotal).toEqual([64,4])
  expect(m.sequenceException.total).toEqual([140,16]);expect(m.pgTapSetup.installations).toBe(1)
  expect(m.allSequencePolicy.total).toEqual([120,12]);expect(m.nativeAdmissionPolicy.windowSeconds).toBe(30)
  expect(m.timeouts.transactionSeconds).toBe(150)
  expect(query).not.toHaveBeenCalled();expect(acquireLock).not.toHaveBeenCalled();expect(assertTarget).not.toHaveBeenCalled()
 })
 it('retains prior allocations and rejects excess or malformed increments',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-cash.mjs')
  expect(m.workflowCashCumulative([0n,0n])).toEqual([76n,12n])
  expect(m.workflowCashCumulative([64n,4n])).toEqual([140n,16n])
  for(const x of [[65n,0n],[0n,5n],[-1n,0n],[0,0],[0n]])expect(()=>m.workflowCashCumulative(x)).toThrow('SEQUENCE_BUDGET')
 })
 it('runs exactly one cash transaction with original native guards',async()=>{
  const h=harness(),result=await h.execute()
  expect(h.batchCount()).toBe(1);expect(result.receipts.map((x:{assertions:number})=>x.assertions)).toEqual([22])
  expect(result.sequenceAllocations).toEqual(['38','4']);expect(result.cumulativeSequenceAllocations).toEqual(['114','16'])
  expect(result.priorCumulativeSequenceAllocations).toEqual(['76','12']);expect(result.snapshotCount).toBe(3);expect(result.allSequenceSnapshotCount).toBe(3)
  expect(h.batchSql[0]).toContain('audit 56');expect(h.batchSql[0]).toContain("interval '30 seconds'");expect(h.batchSql[0]).toContain("transaction_timeout='150s'")
  expect(h.batchSql[0]).not.toContain('select plan(80)');expect(h.reserve).toHaveBeenCalledTimes(1)
 },30000)
 it('rejects altered cash fixture before target or dispatch',async()=>{
  const f=sources(),assertTarget=vi.fn(),query=vi.fn();f.suites[3]!.sql=f.suites[3]!.sql.replace('rollback;','-- changed cash\nrollback;')
  await expect(runWorkflowRehearsal({...f,profile:'cash22',assertTarget,query})).rejects.toThrow('PRIOR_SOURCE_CHANGED')
  expect(assertTarget).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled()
 })
 it('stops on in-transaction state change with no automatic replay',async()=>{
  const h=harness({changedState:true});await expect(h.execute()).rejects.toThrow('ADMISSION_STATE_CHANGED')
  expect(h.batchSql).toHaveLength(1);expect(h.batchCount()).toBe(0);expect(h.lease.release).toHaveBeenCalledTimes(1)
 },30000)
 it('rejects unpinned receipt bytes',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-cash.mjs'),name='native-3dadead2-edce-47d0-be82-407f5465451e-receipt-2.json',bytes=readFileSync(directory+name)
  expect(()=>m.verifyWorkflowCashEvidenceFile(name,bytes)).not.toThrow()
  expect(()=>m.verifyWorkflowCashEvidenceFile(name,Buffer.concat([bytes,Buffer.from(' ')]))).toThrow('CASH_EVIDENCE_CHANGED')
 })
 it('does not treat further maintenance or data changes as runtime exceptions',async()=>{
  const m=await import('../../../scripts/c1-cost-workflow-rehearsal-cash.mjs'),remaining=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs')
  const p=m.readWorkflowCashProvenance(fixture.root,sources()),row={...structuredClone(nativeRow),allSequences:structuredClone(allRow)}
  const object=row.snapshot.catalogueObjects.find((x:{kind:string;identity:string})=>x.kind==='class'&&x.identity==='20584');object.metadata.relfrozenxid='999999'
  expect(()=>remaining.assertWorkflowRemainingBaseline(row,p)).toThrow()
 })
})

describe('approved image lock source transition',()=>{
 it('accepts exact approved lock/proof/patch and rejects any changed byte or old pin',async()=>{
  const {verifyWorkflowRemainingApprovedImageLock:verify}=await import('../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs')
  const file={name:'pnpm-lock.yaml',sha256:'2854a69099d243c4008d2d6310bcf60c88c14bf85d5f6805621803d22a1e5d86'}
  const lock=readFileSync('pnpm-lock.yaml'),delivery=readFileSync('/data/remote-jobs/taskovia-ocr-image-appdeps-20261006/image-app-dependencies-delivery.json'),patch=readFileSync('/data/remote-jobs/taskovia-ocr-image-appdeps-20261006/image-ocr-with-app-dependencies.patch')
  expect(verify(file,lock,delivery,patch)).toBe(true)
  for(const [a,b,c] of [[Buffer.concat([lock,Buffer.from(' ')]),delivery,patch],[lock,Buffer.concat([delivery,Buffer.from(' ')]),patch],[lock,delivery,Buffer.concat([patch,Buffer.from(' ')])]])expect(verify(file,a,b,c)).toBe(false)
  expect(verify({...file,sha256:'0'.repeat(64)},lock,delivery,patch)).toBe(false)
 })
 it('current source cannot reuse historical admission before target, query, lock or retry reserve',async()=>{
  const assertTarget=vi.fn(),query=vi.fn(),acquireLock=vi.fn(),reserveRetry=vi.fn()
  await expect(runWorkflowRehearsal({...readWorkflowRehearsal(process.cwd()),cwd:process.cwd(),profile:'cash22',assertTarget,query,acquireLock,reserveRetry})).rejects.toThrow('PRIOR_SOURCE_CHANGED')
  for(const spy of [assertTarget,query,acquireLock,reserveRetry])expect(spy).not.toHaveBeenCalled()
 })
 it('current fixture pins reject altered reviewed source identities',()=>{
  const manifest=structuredClone(verifyCurrentRehearsalFixtureSources(process.cwd()))
  manifest.sources[0].currentSha256='0'.repeat(64)
  expect(()=>verifyCurrentRehearsalFixtureSources(process.cwd(),manifest)).toThrow('CURRENT_REHEARSAL_FIXTURE_SOURCE_CHANGED')
 })

})
