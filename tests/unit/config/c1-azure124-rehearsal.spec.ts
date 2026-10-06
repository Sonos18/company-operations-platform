import {workflowCliFailure,workflowCliDiagnostic} from '../../../scripts/c1-cost-workflow-rehearsal-transport.mjs'
import {readFileSync} from 'node:fs'
import {describe,it,expect,vi} from 'vitest'
import {runWorkflowRehearsal,reviewWorkflowRehearsal,workflowCollectTapSql} from '../../../scripts/run-c1-cost-workflow-rehearsal.mjs'
import {readWorkflowAzureRehearsal,workflowAzureProfile,workflowAzureSetupSql,workflowAzureHistoryCaptureSql,workflowAzureDependencyPreflightSql} from '../../../scripts/c1-cost-workflow-rehearsal-azure.mjs'
import {workflowAllSequenceSnapshot} from '../../../scripts/c1-cost-workflow-rehearsal-all-sequences.mjs'
import {workflowSha} from '../../../scripts/c1-cost-workflow-rehearsal-inventory.mjs'
import {workflowManagedDdlGuardSql} from '../../../scripts/c1-cost-workflow-rehearsal-managed-ddl.mjs'
vi.mock('../../../scripts/run-supabase-dev.mjs',()=>({isolatedSupabaseEnvironment:vi.fn(()=>({}))}))
const retained='.superpowers/sdd/2026-10-04-document-backed-installment-approval/'
const raw=JSON.parse(readFileSync(retained+'native-14ad5a8e-6d52-4255-bf6d-d80a0fc4e8e6-snapshot-2.json','utf8'))
const original={...raw,snapshot:JSON.parse(raw.snapshot)}
const originalAll=workflowAllSequenceSnapshot({rows:[JSON.parse(readFileSync(retained+'native-14ad5a8e-6d52-4255-bf6d-d80a0fc4e8e6-all-sequences-2.json','utf8'))]})
function harness(options:{fail?:boolean;audit?:number;catalogueDrift?:boolean}={}){
 let time=Date.parse('2026-10-06T09:00:00Z'),batches=0
 const lease={assertHeld:vi.fn(),release:vi.fn(async()=>{})}
 const query=vi.fn(async(sql:string)=>{
  if(!sql.startsWith('/*c1cw-')&&sql.includes('workflow_snapshot_result')){
   const row=structuredClone(original);row.server_time=new Date(time).toISOString()
   if(batches&&options.audit)row.snapshot.sequences['public.audit_events_id_seq'].lastValue=String(BigInt(row.snapshot.sequences['public.audit_events_id_seq'].lastValue)+BigInt(options.audit))
   if(batches&&options.catalogueDrift){
    const object=row.snapshot.catalogueObjects.find((x:{kind:string;identity:string})=>x.kind==='class'&&x.identity==='30098');object.metadata.relpages=4;object.sha256='a'.repeat(64)
    row.snapshot.catalogueObjectHashesSha256=workflowSha(row.snapshot.catalogueObjects.map((x:{sha256:string})=>x.sha256).join('\n'))
    row.snapshot.catalogueSha256='b'.repeat(64);row.snapshot.catalogueComparableSha256='c'.repeat(64)
   }
   return {rows:[row]}
  }
  if(!sql.startsWith('/*c1cw-')&&sql.includes('workflow_all_sequence_census')){
   const row=structuredClone(originalAll);row.server_time=new Date(time).toISOString()
   if(batches&&options.audit)row.sequences['20603'].lastValue=String(BigInt(row.sequences['20603'].lastValue)+BigInt(options.audit))
   return {rows:[row]}
  }
  if(sql.includes('workflow_admission_clock'))return {rows:[{server_time:new Date(time).toISOString(),database:'postgres',username:'postgres'}]}
  if(sql.startsWith('/*c1cw-')){
   batches++
   if(options.fail)throw Error('WORKFLOW_REHEARSAL_MANAGED_DDL_CHANGED')
   return {rows:[{tap_rows:[{tap:'1..124'},...Array.from({length:124},(_,i)=>({tap:'ok '+(i+1)+' - synthetic Azure'}))],result:'C1_COST_WORKFLOW_HISTORY_CLOSED'}]}
  }
  if(sql.includes('pg_stat_activity')){time+=31000;return {rows:[{server_time:new Date(time).toISOString(),backends:[]}]}}
  return {rows:[]}
 })
 const archive=vi.fn(),reserve=vi.fn(),target=vi.fn(),lock=vi.fn(async()=>lease)
 const preview=()=>runWorkflowRehearsal({profile:workflowAzureProfile,query,assertTarget:target,acquireLock:lock})
 const execute=async()=>{
  const m=await preview()
  return runWorkflowRehearsal({profile:workflowAzureProfile,execute:true,freshBaseline:true,confirmation:m.manifestSha256,authorization:m.manifestSha256,env:{TASKOVIA_COST_OCR_AZURE_ENABLED:'false',TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED:'false'},query,archiveSnapshot:archive,reserveRetry:reserve,assertTarget:target,acquireLock:lock,delay:vi.fn(async()=>{}),nonceFactory:()=> 'c1cw-11111111-1111-4111-8111-111111111111'})
 }
 return {preview,execute,query,archive,reserve,target,lock,lease}
}
describe('fixed source-only Azure124 admission profile',()=>{
 it('previews exactly9 prerequisites,1 fixture,zero persistent allocations without DB seam',async()=>{
  const h=harness(),m=await h.preview()
  expect(m.migrations).toHaveLength(9);expect(m.suites[0].assertions).toBe(124);expect(m.executionSuites).toEqual([{index:0,name:'c1_cost_ocr_azure_f0_storage.test.sql',sha256:m.suites[0].sha256,assertions:124}])
  expect(m.azureExecutionScope).toMatchObject({syntheticOriginals:6,syntheticJobs:7,syntheticReservedPageUnits:10,syntheticCeiling:25,persistentAuditRoleAllowance:[0,0],credentialsOrProvider:false})
  expect(m.sequenceException.total).toEqual([0,0]);expect(m.allSequencePolicy.perSuite).toEqual([[0,0]]);expect(m.allSequencePolicy.total).toEqual([0,0]);expect(m.timeouts.transactionSeconds).toBe(120);expect(m.pgTapSetup.installations).toBe(1)
  for(const spy of [h.query,h.target,h.lock])expect(spy).not.toHaveBeenCalled()
 })
 it('requires a new exact manifest approval before target/credentials/lock/query',async()=>{
  const h=harness()
  await expect(runWorkflowRehearsal({profile:workflowAzureProfile,execute:true,freshBaseline:true,query:h.query,assertTarget:h.target,acquireLock:h.lock})).rejects.toThrow('AUTHORIZATION_REQUIRED')
  for(const spy of [h.query,h.target,h.lock])expect(spy).not.toHaveBeenCalled()
 })
 it('rejects either provider gate enabled before target/lock/query',async()=>{
  const h=harness(),m=await h.preview()
  for(const gate of ['TASKOVIA_COST_OCR_AZURE_ENABLED','TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED'])
   await expect(runWorkflowRehearsal({profile:workflowAzureProfile,execute:true,freshBaseline:true,confirmation:m.manifestSha256,authorization:m.manifestSha256,env:{[gate]:'true'},query:h.query,assertTarget:h.target,acquireLock:h.lock})).rejects.toThrow('GATES_REQUIRED_OFF')
  for(const spy of [h.query,h.target,h.lock])expect(spy).not.toHaveBeenCalled()
 })
 it('rejects changed fixture or migration before any target/query',()=>{
  const sources=readWorkflowAzureRehearsal(process.cwd())
  sources.suites[0].sql+='\n-- changed'
  expect(()=>reviewWorkflowRehearsal({...sources,profile:workflowAzureProfile})).toThrow('AZURE_SOURCE_CHANGED')
 })
 it('retains exact handler gate, fixed namespace and history coverage of existing tables',()=>{
  expect(workflowAzureSetupSql).toContain('^c1f60000-')
  expect(workflowAzureSetupSql).not.toContain('^c1f5')
  expect(workflowAzureSetupSql).toContain('AZURE_ALREADY_INSTALLED')
  expect(workflowAzureHistoryCaptureSql('after-DDL')).toContain("not(n.nspname='private' and c.relname in('c1_cost_ocr_azure_resources','c1_cost_ocr_azure_months','c1_cost_ocr_azure_jobs'))")
  const guard=workflowAzureDependencyPreflightSql({functions:[],relations:[],triggers:[],reachableFunctions:[]},{pgTapPhase:'available'})
  expect(guard).toContain(workflowManagedDdlGuardSql)
  expect(guard).toContain("r.prosrc='textoctetlen'")
  expect(guard).toContain("r.proargtypes[0]='text'::regtype")
  expect(guard).toContain('WORKFLOW_REHEARSAL_IMPLICIT_FUNCTION_UNREVIEWED')
 })
 it('collects exactly124 original assertions and finish(true) without skipping or rewriting command SELECTs',()=>{
  const {suites}=readWorkflowAzureRehearsal(process.cwd())
  const body=suites[0].sql.replace(/^([\s\S]*?)\nbegin;/,(_m:string,comments:string)=>comments).replace(/rollback;\s*$/,'')
  const wrapped=workflowCollectTapSql(body,0,true)
  expect(wrapped.match(/workflow_tap_text:=/g)).toHaveLength(125)
  expect(wrapped).toContain('select * from finish(true)')
  expect(wrapped).toContain("set local role authenticated;")
 })
 it('captures raw baseline and executes one Azure-only rollback with full/all5 guards and no permanent allocations',async()=>{
  const h=harness(),r=await h.execute()
  expect(r.receipts).toHaveLength(1);expect(r.receipts[0].assertions).toBe(124);expect(r.sequenceAllocations).toEqual(['0','0'])
  expect(h.reserve).toHaveBeenCalledTimes(1);expect(h.lease.release).toHaveBeenCalledTimes(1)
  const batches=h.query.mock.calls.filter(x=>x[0].startsWith('/*c1cw-'))
  expect(batches).toHaveLength(1);const sql=batches[0][0]
  for(const fragment of ['workflow_state_admission','workflow_pgtap_sequence_admission',workflowManagedDdlGuardSql,"transaction_timeout='120s'","interval '30 seconds'",'audit 0','AZURE_FIXTURE_RESOURCE_NOT_EMPTY'])expect(sql).toContain(fragment)
  expect(sql).not.toContain('select plan(80)')
  expect(h.archive.mock.calls.some(x=>x[1]==='baseline')).toBe(true)
 },30000)
 it('stops without replay and still archives cleanup/full/all5 postflight on a gate failure',async()=>{
  const h=harness({fail:true});await expect(h.execute()).rejects.toThrow('MANAGED_DDL_CHANGED')
  expect(h.query.mock.calls.filter(x=>x[0].startsWith('/*c1cw-'))).toHaveLength(1)
  const closure=h.archive.mock.calls.find(x=>x[1]==='closure-0')![0]
  expect(closure).toMatchObject({postflightConfirmed:true,sequenceAllocations:['0','0'],cleanup:{ownedTransactionAbsent:true,admissionExpired:true}})
 },30000)
 it('fails closed on one persistent audit allocation',async()=>{
  const h=harness({audit:1});await expect(h.execute()).rejects.toThrow('SEQUENCE_BUDGET')
  expect(h.query.mock.calls.filter(x=>x[0].startsWith('/*c1cw-'))).toHaveLength(1)
 },30000)
 it('retains strict physical catalogue postflight',async()=>{
  const h=harness({catalogueDrift:true});await expect(h.execute()).rejects.toThrow('POSTFLIGHT_DRIFT')
  expect(h.query.mock.calls.filter(x=>x[0].startsWith('/*c1cw-'))).toHaveLength(1)
 },30000)
})

describe('bounded Azure124 primary CLI failure evidence',()=>{
 it.each([81,124])('retains assertion%s only with the Azure124 diagnostic scope',(assertion)=>{
  const input={stdout:'',stderr:'ERROR: P0001: WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE assertion='+assertion+' sqlstate=42501',status:1,sqlSha256:'a'.repeat(64)}
  expect(workflowCliDiagnostic(workflowCliFailure(input)).firstTapFailure).toBeNull()
  expect(workflowCliDiagnostic(workflowCliFailure({...input,maximumTapAssertion:124})).firstTapFailure).toEqual({assertion,sqlstate:'42501'})
 })
 it('rejects out-of-profile bounds and does not retain assertions above124',()=>{
  const input={stdout:'',stderr:'ERROR: P0001: WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE assertion=125 sqlstate=unknown',status:1,sqlSha256:'a'.repeat(64)}
  expect(workflowCliDiagnostic(workflowCliFailure({...input,maximumTapAssertion:124})).firstTapFailure).toBeNull()
  expect(()=>workflowCliFailure({...input,maximumTapAssertion:125})).toThrow('DIAGNOSTIC_INVALID')
 })
 it('retains only known Azure guard codes without exporting arbitrary prose',()=>{
  const error=workflowCliFailure({stdout:'',stderr:'ERROR: P0001: AZURE_FIXTURE_RESOURCE_NOT_EMPTY\nDETAIL: internal-sensitive-prose',status:1,sqlSha256:'a'.repeat(64),maximumTapAssertion:124})
  const diagnostic=workflowCliDiagnostic(error)
  expect(diagnostic.messageCode).toBe('AZURE_FIXTURE_RESOURCE_NOT_EMPTY')
  expect(JSON.stringify(diagnostic)).not.toContain('internal-sensitive-prose')
 })
})
