import {describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {costWorkflowSqlFiles} from '../../../scripts/run-c1-cost-workflow-tests.mjs'
import {reviewWorkflowRehearsal,runWorkflowRehearsal,costWorkflowMigrationFiles,costWorkflowAssertionCounts} from '../../../scripts/run-c1-cost-workflow-rehearsal.mjs'
vi.mock('../../../scripts/run-supabase-dev.mjs',()=>({isolatedSupabaseEnvironment:vi.fn(()=>({}))}))
const sql="set local lock_timeout='5s'; select 1;"
const fixture=()=>({migrations:costWorkflowMigrationFiles.map(name=>({name,sql})),suites:costWorkflowSqlFiles.map((name,i)=>({name,sql:"begin; select plan("+costWorkflowAssertionCounts[i]+"); select * from finish(); rollback;"}))})
describe('exact cost workflow rollback rehearsal preparation',()=>{
 it('previews exact migration/test byte hashes without target lookup or database processes',async()=>{const assertTarget=vi.fn(),spawn=vi.fn();const result=await runWorkflowRehearsal({...fixture(),assertTarget,spawn});expect(result.mode).toBe('preview');expect(result.migrations).toHaveLength(8);expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/);expect(assertTarget).not.toHaveBeenCalled();expect(spawn).not.toHaveBeenCalled()})
 it('rejects unreviewed/missing migration names and source byte changes alter the confirmation',()=>{const f=fixture();expect(()=>reviewWorkflowRehearsal({...f,migrations:f.migrations.slice(1)})).toThrow('WORKFLOW_REHEARSAL_MIGRATION_SET');const a=reviewWorkflowRehearsal(f);f.migrations[0]!.sql+=' select 2;';expect(reviewWorkflowRehearsal(f).manifestSha256).not.toBe(a.manifestSha256)})
 it('requires both explicit operation authorization and exact-byte confirmation before target/network',async()=>{const assertTarget=vi.fn(),spawn=vi.fn();await expect(runWorkflowRehearsal({...fixture(),execute:true,confirmation:'wrong',authorization:'wrong',assertTarget,spawn})).rejects.toThrow('WORKFLOW_REHEARSAL_AUTHORIZATION_REQUIRED');expect(assertTarget).not.toHaveBeenCalled();expect(spawn).not.toHaveBeenCalled()})
 it('checks DEV target before starting any authorized child process',async()=>{const f=fixture(),hash=reviewWorkflowRehearsal(f).manifestSha256,spawn=vi.fn();await expect(runWorkflowRehearsal({...f,execute:true,confirmation:hash,authorization:hash,assertTarget:()=>{throw new Error('WRONG_TARGET')},spawn})).rejects.toThrow('WRONG_TARGET');expect(spawn).not.toHaveBeenCalled()})
 it('rejects SQL transaction controls and destructive or foreign fixture writes',()=>{const f=fixture();f.migrations[0]!.sql+=' commit;';expect(()=>reviewWorkflowRehearsal(f)).toThrow();const g=fixture();g.suites[0]!.sql='begin; delete from public.tenants; rollback;';expect(()=>reviewWorkflowRehearsal(g)).toThrow('UNSAFE_WORKFLOW_SQL')})
 it('rejects a missing/reordered suite and an assertion plan below the reviewed total',()=>{const f=fixture();expect(()=>reviewWorkflowRehearsal({...f,suites:f.suites.slice(1)})).toThrow('WORKFLOW_REHEARSAL_TEST_SET');f.suites.reverse();expect(()=>reviewWorkflowRehearsal(f)).toThrow('WORKFLOW_REHEARSAL_TEST_SET');const g=fixture();g.suites[0]!.sql=g.suites[0]!.sql.replace('plan(80)','plan(1)');expect(()=>reviewWorkflowRehearsal(g)).toThrow('WORKFLOW_REHEARSAL_PLAN')})
 it('wraps all four mock executions with namespace/history closure and validates the exact assertion totals',async()=>{
  const f=fixture(),hash=reviewWorkflowRehearsal(f).manifestSha256;let i=0
  const spawn=vi.fn((_cmd:string,args:string[])=>{
   const sql=readFileSync(args[args.indexOf('--file')+1]!, 'utf8')
   expect(sql).toContain("set transaction isolation level repeatable read")
   expect(sql.indexOf('WORKFLOW_REHEARSAL_FIXTURE_COLLISION')).toBeLessThan(sql.indexOf("values('before-DDL'"))
   expect(sql).toContain("values('after-DDL'")
   expect(sql).toContain('WORKFLOW_REHEARSAL_HISTORY_CHANGED')
   expect(sql).toContain('WORKFLOW_REHEARSAL_NONTRANSACTIONAL_SEQUENCE')
   expect(sql.indexOf('set local row_security=on')).toBeLessThan(sql.indexOf('select plan('))
   expect(sql.trim().endsWith('rollback;')).toBe(true)
   const count=costWorkflowAssertionCounts[i++]!
   return {status:0,stdout:JSON.stringify({rows:[{plan:'1..'+count},...Array.from({length:count},(_,j)=>({ok:'ok '+(j+1)+' - synthetic'})),{result:'C1_COST_WORKFLOW_HISTORY_CLOSED'},{result:'C1_COST_WORKFLOW_REHEARSAL_COMPLETE'}]})}
  })
  const result=await runWorkflowRehearsal({...f,execute:true,confirmation:hash,authorization:hash,assertTarget:vi.fn(),spawn})
  expect(spawn).toHaveBeenCalledTimes(4);expect(result.receipts.map((r:{assertions:number})=>r.assertions)).toEqual([80,13,28,22])
 })
})
