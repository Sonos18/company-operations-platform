import { describe, expect, it } from 'vitest'
import { validateCostWorkflowSql } from '../../../scripts/run-c1-cost-workflow-tests.mjs'
describe('workflow privilege assertions', () => {
 it('permits catalog inspection of destructive privileges without granting them',()=>{
  expect(()=>validateCostWorkflowSql('c1_cost_workflow_security.test.sql',"begin; select ok(not has_table_privilege('anon','public.cost_workflow_requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')); rollback;")).not.toThrow()
 })
 it('still rejects an actual destructive statement next to a privilege assertion',()=>{
  expect(()=>validateCostWorkflowSql('c1_cost_workflow_security.test.sql',"begin; select has_table_privilege('anon','public.cost_workflow_requests','INSERT,UPDATE,DELETE,TRUNCATE'); delete from public.cost_workflow_requests; rollback;")).toThrow('UNSAFE_WORKFLOW_SQL')
 })
})
