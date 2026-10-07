import {readFileSync as nativeRead} from 'node:fs'
import {resolve} from 'node:path'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {workflowCashRetryCumulative,workflowCashRetryPriorAllocations,workflowCashRetryCumulativeBudgets,readWorkflowCashRetryProvenance,reserveWorkflowCashRetryOnce} from '../../../scripts/c1-cost-workflow-rehearsal-cash-retry109.mjs'

const state=vi.hoisted(()=>({fakeWrite:vi.fn(),fakeMkdir:vi.fn()}))
vi.mock('node:fs',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('node:fs')>()
 return {...actual,writeFileSync:state.fakeWrite,mkdirSync:state.fakeMkdir}
})
const migrations=[
 '20261004210000_c1_cost_workflow_foundation.sql','20261004210100_c1_cost_workflow_security.sql',
 '20261004210200_c1_cost_request_evidence.sql','20261004210300_c1_cost_workflow_request_commands.sql',
 '20261004210400_c1_cost_workflow_cash_commands.sql','20261004210500_c1_cost_workflow_reconciliation.sql',
 '20261004210600_c1_cost_workflow_extraction.sql','20261004210700_c1_cost_workflow_directory.sql',
].map(name=>({name,sql:nativeRead(resolve('supabase/migrations',name),'utf8')}))
const suites=['security','evidence','requests','cash'].map(kind=>{const name='c1_cost_workflow_'+kind+'.test.sql';return {name,sql:nativeRead(resolve('supabase/tests/database/c1',name),'utf8')}})

describe('cash22 retry109 admission is separately bounded and non-replayable',()=>{
 beforeEach(()=>vi.clearAllMocks())
 it('binds retained121 evidence and the consumed failure without claiming strict historical postflight',()=>{
  const prior=readWorkflowCashRetryProvenance(process.cwd(),{migrations,suites})
  expect(prior.descriptor.retainedPassedAssertions).toBe(121)
  expect(prior.descriptor.priorStrictPostflight).toBe(false)
  expect(prior.descriptor.generalMaintenanceException).toBe(false)
  expect(prior.descriptor.priorCumulativeAllocations).toEqual(['109','16'])
  expect(prior.anchorFull.snapshot.catalogueObjectCount).toBe(8170)
  expect(Object.keys(prior.anchorAll.sequences)).toHaveLength(5)
 })
 it('allows precisely56/4 on top of109/16 and rejects either excess',()=>{
  expect(workflowCashRetryPriorAllocations).toEqual(['109','16'])
  expect(workflowCashRetryCumulativeBudgets).toEqual([165,20])
  expect(workflowCashRetryCumulative([56n,4n])).toEqual([165n,20n])
  expect(()=>workflowCashRetryCumulative([57n,4n])).toThrow('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
  expect(()=>workflowCashRetryCumulative([56n,5n])).toThrow('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
  expect(()=>workflowCashRetryCumulative([-1n,0n])).toThrow('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
 })
 it('rejects current migration or original cash fixture changes',()=>{
  const changed=migrations.map(x=>({...x}));changed[4].sql+='-- changed'
  expect(()=>readWorkflowCashRetryProvenance(process.cwd(),{migrations:changed,suites})).toThrow('WORKFLOW_REHEARSAL_CASH_RETRY_EVIDENCE_CHANGED')
  const changedSuites=suites.map(x=>({...x}));changedSuites[3].sql+='-- changed'
  expect(()=>readWorkflowCashRetryProvenance(process.cwd(),{migrations,suites:changedSuites})).toThrow('WORKFLOW_REHEARSAL_CASH_RETRY_EVIDENCE_CHANGED')
 })
 it('reserves a process-independent fixed once marker with exclusive creation',()=>{
  reserveWorkflowCashRetryOnce('a'.repeat(64),'b'.repeat(64),'synthetic-run')
  expect(state.fakeWrite).toHaveBeenCalledTimes(1)
  const [path,bytes,options]=state.fakeWrite.mock.calls[0]!
  expect(path).toBe('/data/remote-jobs/taskovia-cash22-retry109-v1-20261006/once.started.json')
  expect(options).toEqual({mode:0o600,flag:'wx'})
  expect(JSON.parse(bytes).automaticReplay).toBe(false)
  expect(JSON.parse(bytes).allowance).toEqual([56,4])
  state.fakeWrite.mockImplementationOnce(()=>{throw new Error('EEXIST')})
  expect(()=>reserveWorkflowCashRetryOnce('a'.repeat(64),'b'.repeat(64),'synthetic-run')).toThrow('WORKFLOW_REHEARSAL_RETRY_ALREADY_CONSUMED')
 })
 it('keeps default preview ahead of authorization, DB target, lock and once reservation',()=>{
  const runner=nativeRead('scripts/run-c1-cost-workflow-rehearsal.mjs','utf8')
  const start=runner.indexOf('export async function runWorkflowRehearsal(')
  const body=runner.slice(start)
  const preview=body.indexOf("if(!execute&&!captureBaseline)return {mode:'preview',...manifest}")
  expect(preview).toBeGreaterThan(0)
  for(const boundary of ['assertTarget({','await acquireLock()','reserveWorkflowCashRetryOnce(','await runQuery('])expect(body.indexOf(boundary)).toBeGreaterThan(preview)
 })
})
