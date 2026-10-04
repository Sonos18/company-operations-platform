import { describe, expect, it } from 'vitest'
import { validateCostWorkflowSql, assertWorkflowTapResult, runCostWorkflowTests } from '../../../scripts/run-c1-cost-workflow-tests.mjs'
const name = 'c1_cost_workflow_security.test.sql'
const safe = "begin; select plan(1); select ok(true,'synthetic'); select * from finish(); rollback;"
describe('cost workflow Cloud DEV runner', () => {
 it('accepts only an allowlisted rollback-only suite', () => { expect(()=>validateCostWorkflowSql(name,safe)).not.toThrow(); expect(()=>validateCostWorkflowSql('unknown.test.sql',safe)).toThrow('UNKNOWN_WORKFLOW_SQL') })
 it.each(["begin; select 1; commit;","select 1; rollback;","begin; select 1;"])('rejects statements able to retain fixture writes', sql=>{expect(()=>validateCostWorkflowSql(name,sql)).toThrow()})
 it.each(["begin; alter table public.audit_events disable trigger all; rollback;","begin; delete from public.tenants; rollback;","begin; truncate public.audit_events; rollback;","begin; select 'migration repair'; rollback;","begin; select '10000000-0000-4000-8000-000000000020'; rollback;","begin; select 'VQH'; rollback;"])('rejects unsafe fixture SQL before contacting DEV', sql=>{expect(()=>validateCostWorkflowSql(name,sql)).toThrow()})
 it('allows reserved synthetic namespace but rejects other UUID literals',()=>{expect(()=>validateCostWorkflowSql(name,"begin; select 'c1f50000-0000-4000-8000-000000000001'; rollback;")).not.toThrow();expect(()=>validateCostWorkflowSql(name,"begin; select 'c1f10000-0000-4000-8000-000000000001'; rollback;")).toThrow('WORKFLOW_FIXTURE_SCOPE')})
 it('fails a not-ok assertion even when the CLI exits zero',()=>{expect(()=>assertWorkflowTapResult({rows:[{plan:'1..1'},{ok:'not ok 1 - denied'}]})).toThrow('WORKFLOW_TAP_FAILED')})
 it('rejects missing assertions or malformed envelopes',()=>{expect(()=>assertWorkflowTapResult({rows:[]})).toThrow('WORKFLOW_TAP_INVALID');expect(()=>assertWorkflowTapResult({rows:[{plan:'1..2'},{ok:'ok 1 - checked'}]})).toThrow('WORKFLOW_TAP_INVALID');expect(()=>assertWorkflowTapResult({rows:[{plan:'1..1'},{ok:'ok 1 - checked'}]})).not.toThrow()})
 it('checks canonical target before any child process',()=>{let contacted=false;expect(()=>runCostWorkflowTests({files:[{path:name,sql:safe}],assertTarget:()=>{throw new Error('WRONG_TARGET')},spawn:()=>{contacted=true;throw new Error('should not run')}})).toThrow('WRONG_TARGET');expect(contacted).toBe(false)})
 it('rejects invalid SQL before target lookup',()=>{let target=false;expect(()=>runCostWorkflowTests({files:[{path:name,sql:'commit;'}],assertTarget:()=>{target=true},spawn:()=>{throw new Error('never')}})).toThrow();expect(target).toBe(false)})
})
