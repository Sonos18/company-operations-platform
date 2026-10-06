import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import {workflowCollectTapSql} from '../../../scripts/run-c1-cost-workflow-rehearsal.mjs'
import {workflowCliFailure,workflowCliDiagnostic} from '../../../scripts/c1-cost-workflow-rehearsal-transport.mjs'

describe('cash source correction and first caught TAP failure',()=>{
 it('qualifies approved decision lookup in both cash mutation paths',()=>{
  const sql=readFileSync('supabase/migrations/20261004210400_c1_cost_workflow_cash_commands.sql','utf8')
  const queries=sql.match(/select d\.\* into decision from public\.cost_workflow_decisions d where d\.submitted_version_id=snapshot\.id and d\.decision='approve';/g)||[]
  expect(queries).toHaveLength(2)
  expect(sql).not.toContain("where submitted_version_id=snapshot.id and decision='approve'")
  expect(sql).toContain("cash_state.version<>expected")
 })
 it('keeps all22 fixture assertions and original version domains',()=>{
  const sql=readFileSync('supabase/tests/database/c1/c1_cost_workflow_cash.test.sql','utf8')
  expect(sql).toContain('select plan(22);')
  const refund=sql.split('\n').find(x=>x.includes("select 'refund'"))!
  expect(refund).toContain('"expectedVersion":0')
  const correction=sql.split('\n').find(x=>x.includes("select 'correction'"))!
  expect(correction).toContain('"expectedVersion":1')
 })
 it('evaluates original assertions once and stops at a bounded first failure',()=>{
  const sql=readFileSync('supabase/tests/database/c1/c1_cost_workflow_cash.test.sql','utf8')
  const wrapped=workflowCollectTapSql(sql,3)
  expect(wrapped).toContain('WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE')
  expect(wrapped).toContain('workflow_tap_text:=')
  expect(wrapped.match(/confirmed actual refund succeeds/g)).toHaveLength(1)
  expect(wrapped).not.toContain("raise exception using message=workflow_tap_text")
 })
 it('retains earlier caught42702 separately from outerP0001 without raw payload',()=>{
  const error=workflowCliFailure({stdout:'',stderr:'ERROR: P0001: WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE assertion=12 sqlstate=42702\nDETAIL: synthetic-private-error-body',status:1,sqlSha256:'a'.repeat(64)})
  const diagnostic=workflowCliDiagnostic(error)
  expect(diagnostic.sqlstate).toBe('P0001')
  expect(diagnostic.firstTapFailure).toEqual({assertion:12,sqlstate:'42702'})
  expect(diagnostic.messageCode).toBe('WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE')
  expect(JSON.stringify(diagnostic)).not.toContain('synthetic-private')
 })
 it('never attributes TAP markers found only in dumped SQL',()=>{
  const error=workflowCliFailure({stdout:'',stderr:'ERROR: 42601: syntax error\nSTATEMENT: WORKFLOW_REHEARSAL_TAP_FIRST_FAILURE assertion=12 sqlstate=42702',status:1,sqlSha256:'a'.repeat(64)})
  expect(workflowCliDiagnostic(error).firstTapFailure).toBeNull()
 })
})
