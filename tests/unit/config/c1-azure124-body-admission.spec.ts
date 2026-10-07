import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {workflowFunctionInventory,workflowDependencyInventory,readWorkflowBaseMigrations,workflowSha} from '../../../scripts/c1-cost-workflow-rehearsal-inventory.mjs'
import {readWorkflowAzureRehearsal,workflowAzureDependencyPreflightSql} from '../../../scripts/c1-cost-workflow-rehearsal-azure.mjs'
const sources=readWorkflowAzureRehearsal(process.cwd()),baseMigrations=readWorkflowBaseMigrations(process.cwd())
const inventory=workflowDependencyInventory({baseMigrations,...sources})
const admission=workflowAzureDependencyPreflightSql(inventory)
const expression=/r\.prosrc !~\* '([^']+)'/.exec(admission)?.[1]
if(!expression)throw Error('actual admission prosrc predicate missing')
// These source cases use ASCII tokens. PostgreSQL ARE \\m/\\M match word
// starts/ends; map only those operators to JS boundaries for this mock check.
// This does not execute SQL or validate the remaining catalogue predicates.
const forbidden=new RegExp(expression.replaceAll('\\m','\\b').replaceAll('\\M','\\b'),'i')
const functions=workflowFunctionInventory([...baseMigrations,...sources.migrations])
const rpc=functions.find(f=>f.name==='public.c1_cost_ocr_azure_f0_job')!
describe('Azure RPC source against unchanged raw-body admission expression',()=>{
 it('admits the entire corrected RPC body under the actual raw-body predicate',()=>{
  expect(inventory.reachableFunctions).toContain(rpc.name)
  expect(rpc.types).toEqual(['text','jsonb','jsonb'])
  expect(forbidden.test(rpc.body)).toBe(false)
 })
 it('finds no other raw-body forbidden match in reachable public/private source',()=>{
  const rejected=functions.filter(f=>inventory.reachableFunctions.includes(f.name)&&/^(?:public|private)\./.test(f.name)&&forbidden.test(f.body))
  expect(rejected.map(f=>f.name)).toEqual([])
 })
 it('keeps the prior comment rejected rather than weakening the guard',()=>{
  expect(forbidden.test('-- NEVER regrant on expiry: an old worker may be paused or HTTP delivery ambiguous.')).toBe(true)
 })
 it.each([
  'execute format(sql);','select dblink(connection, sql);','select nextval(sequence_name);',
  'select setval(sequence_name, 1);','select lo_export(1, path);','select http.get(url);',
  'select pg_read_file(path);','select pg_write_file(path, value);',
  'select pg_terminate_backend(1);','select pg_cancel_backend(1);',
 ])('continues rejecting prohibited executable example: %s',body=>expect(forbidden.test(body)).toBe(true))
 it.each(['http_status','nextvalue','execute_count','http2','pg_read_filename'])('preserves existing word boundaries for %s',body=>expect(forbidden.test(body)).toBe(false))
 it('pins the unchanged guard source and the reviewed corrected body hash',()=>{
  expect(workflowSha(readFileSync('scripts/c1-cost-workflow-rehearsal-catalog.mjs','utf8'))).toBe('77da9baf48db0cb2c015f60a21b3da63387741925a82dca2243ffc495772f036')
  expect(rpc.sha256).toBe('19bfe4d8b0f835eb95ea66df2c9cbebcdadab0001a70e265e5df6839685f866f')
 })
})
