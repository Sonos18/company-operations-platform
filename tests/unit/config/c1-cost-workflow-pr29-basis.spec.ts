import { readFileSync, readdirSync } from 'node:fs'
import { expect, it } from 'vitest'
const migrations = readdirSync('supabase/migrations').filter(name => /^\d{14}.*\.sql$/.test(name)).sort()
const sql = migrations.map(name => readFileSync('supabase/migrations/' + name, 'utf8')).join('\n')
function lastFunction(name: string) {
  const starts = [...sql.matchAll(new RegExp('create(?: or replace)? function ' + name + '\\(', 'gi'))]
  const start = starts.at(-1)?.index
  if (start === undefined) throw new Error('FUNCTION_NOT_FOUND ' + name)
  const body = sql.indexOf('as $$', start)
  return sql.slice(start, sql.indexOf('$$;', body + 5) + 3)
}
it('approves the submitted historical basis after the contract current version advances', () => {
  const decide = lastFunction('public.c1_workflow_decide_request')
  expect(decide).toContain("snapshot.snapshot->>'contractVersionId'")
  expect(decide).toMatch(/where id=.*contractVersionId[\s\S]*contract_id=contract.id[\s\S]*tenant_id=t and company_id=target_company_id and project_id=target_project_id/)
  expect(decide).not.toContain('version=contract.current_version')
  expect(decide).toContain("message='CONTRACT_BASIS_REQUIRED'")
  expect(decide).toContain('request.contract_id,basis.id')
})
it('pins an implicitly mapped subcontract basis at submission rather than inferring it at decision time', () => {
  const submit = lastFunction('public.c1_workflow_submit_request')
  expect(submit).toContain('submitted_input jsonb')
  expect(submit).toContain("jsonb_build_object('contractVersionId',basis.id)")
  expect(submit).toContain('next_snapshot,submitted_input')
  expect(submit).toContain('working_input=submitted_input')
  expect(submit).toContain('for update')
})
it('retains current cap rechecking, manager authority, completion guard and command receipt replay', () => {
  const decide = lastFunction('public.c1_workflow_decide_request')
  expect(decide).toContain('private.c1_workflow_require_cap(t,target_company_id,target_project_id,request.contract_id,snapshot.amount)')
  expect(decide).toContain('assignment.manager_user_id is distinct from auth.uid()')
  expect(decide).toContain('private.c1_lock_writable_project(t,target_company_id,target_project_id)')
  expect(decide).toContain("choice:='return';reason:")
  expect(decide.indexOf('receipt.id is not null')).toBeLessThan(decide.indexOf("snapshot.snapshot->>'contractVersionId'"))
  const cap = lastFunction('private.c1_workflow_require_cap')
  expect(cap).toContain('version=contract.current_version')
  expect(cap).toContain("message='LEGACY_RECONCILIATION_REQUIRED'")
})
it('restricts source subcontract options to authorized preparation and the exact active unmapped project scope', () => {
  const list = lastFunction('public.c1_workflow_list_source_subcontracts')
  expect(list).toContain('private.c1_workflow_read_scope(target_company_id,target_project_id)')
  expect(list).toContain("'cost.request.submit'")
  expect(list).toContain("'cost.prepare'")
  expect(list).toContain('s.tenant_id=t and s.company_id=target_company_id and s.project_id=target_project_id and s.is_active')
  expect(list).toContain('mapped.source_subcontract_id=s.id')
  expect(list).not.toContain('contract_value')
  expect(list).not.toMatch(/insert into|update public|delete from/i)
})
