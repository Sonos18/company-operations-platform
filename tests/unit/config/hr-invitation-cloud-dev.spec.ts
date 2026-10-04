import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHrPostRollbackSql, buildHrOrderedCase, buildHrSql, HR_COMMITTED_FIXTURE_BLOCKER, HR_LIMITS, runHr } from '../../../scripts/run-hr-invitation-cloud-dev.mjs'
const owner = 'a1111111-1111-4111-8111-111111111111'
const cwd = process.cwd()
beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })
function harness() {
 const empty = { fixture_counts: {"auth.users":0,"public.tenants":0,"public.companies":0,"public.tenant_memberships":0,"public.role_permissions":0,"public.company_memberships":0,"public.company_role_assignments":0,"public.roles":0,"public.departments":0,"public.positions":0,"public.employees":0,"public.employee_private_details":0,"public.audit_events":0}, migration_applied: 0, function_hash: '11111111111111111111111111111111', guards_hash: '22222222222222222222222222222222' }
 const fetchImpl = vi.fn(async (_url: string, options: RequestInit) => {
  const sql = JSON.parse(options.body as string).query as string
  const rows = sql.includes('server_version_num') ? [{supported:true}]
   : sql.includes('as fixture_counts') ? [{...empty,fixture_counts:{...empty.fixture_counts}}]
    : [{result:'HR_REHEARSE',retained_counts_before_rollback:{'auth.users':3,'public.audit_events':66}}]
  return { ok: true, status: 200, json: async () => rows }
 })
 return { fetchImpl, empty, args: { owner, cwd, fetchImpl, guard: vi.fn(), tokenReader: vi.fn(() => 'synthetic-pat') } }
}
describe('HR rollback lifecycle and retention boundary', () => {
 it('keeps the migration and complete lifecycle rollback-only', () => {
  const sql = buildHrSql('rehearse', owner, { cwd })
  expect(sql).toMatch(/^begin;/)
  expect(sql).toMatch(/rollback;$/)
  expect(sql).not.toMatch(/commit;/)
  for(const proof of ['HR_FIXTURE_COLLISION','HR_EXPECTED_REJECTION','HR_RETENTION_NOT_EXACTLY_20','HR_RETENTION_AUDIT_COUNT_NOT_66','HR_RETAINED_RLS_COMPANY_ACCESS','HR_RETAINED_TENANT_VISIBILITY_CHANGED','HR_EXTERNAL_FK_REFERENCE','HR_CROSS_SCOPE_FK_REFERENCE']) expect(sql).toContain(proof)
  expect(sql).toContain('unnest(c.conkey,c.confkey)')
  expect(sql).not.toMatch(/insert into public.permissions|update public.permissions|delete from public.permissions|disable trigger|session_replication_role|delete from public.audit_events|delete from public.company_role_assignments/i)
 })
 it.each(['setup','reset','cleanup','verify'])('blocks %s builders', mode => {
  expect(()=>buildHrSql(mode,owner,{cwd})).toThrow(HR_COMMITTED_FIXTURE_BLOCKER)
 })
 it.each(['concurrency','cleanup'])('blocks %s before reading credentials or HTTP', async mode => {
  const {args,fetchImpl}=harness()
  await expect(runHr(mode,args)).rejects.toThrow(HR_COMMITTED_FIXTURE_BLOCKER)
  expect(args.guard).toHaveBeenCalledOnce()
  expect(args.tokenReader).not.toHaveBeenCalled()
  expect(fetchImpl).not.toHaveBeenCalled()
 })
 it('checks the DEV target before credentials', async () => {
  const {args,fetchImpl}=harness()
  args.guard.mockImplementation(()=>{throw new Error('wrong target')})
  await expect(runHr('rehearse',args)).rejects.toThrow('wrong target')
  expect(args.tokenReader).not.toHaveBeenCalled()
  expect(fetchImpl).not.toHaveBeenCalled()
 })
 it('reconciles zero rows and unchanged function/guards after rollback', async () => {
  const {args,fetchImpl,empty}=harness()
  expect(await runHr('rehearse',args)).toMatchObject({owner,ok:true,postRollback:empty})
  expect(fetchImpl).toHaveBeenCalledTimes(4)
  expect(fetchImpl.mock.calls.every(([url])=>url==='https://api.supabase.com/v1/projects/gtgljlnhwvhqdnwrfdfj/database/query')).toBe(true)
  const requests=fetchImpl.mock.calls.map(([,o])=>JSON.parse(o.body as string))
  expect(requests[1].read_only).toBe(true)
  expect(requests[2].query).toMatch(/rollback;$/)
  expect(requests[3].read_only).toBe(true)
 })
 it.each(['rows','function','guards','missing'])('rejects failed %s reconciliation', async kind => {
  const {args,fetchImpl,empty}=harness()
  const original=fetchImpl.getMockImplementation()!
  let reconciliation=0
  fetchImpl.mockImplementation(async (u,o)=>{
   if(JSON.parse(o.body as string).query.includes('as fixture_counts') && ++reconciliation===2) {
    const row={...empty,fixture_counts:{...empty.fixture_counts}}
    if(kind==='rows') row.fixture_counts['auth.users']=1
    if(kind==='function') row.function_hash='changed'
    if(kind==='guards') row.guards_hash='changed'
    if(kind==='missing') delete (row.fixture_counts as Partial<typeof row.fixture_counts>)['auth.users']
    return {ok:true,status:200,json:async()=>[row]}
   }
   return original(u,o)
  })
  await expect(runHr('rehearse',args)).rejects.toThrow('rollback reconciliation failed')
 })
 it('stops before rehearsal on pre-17 PostgreSQL', async () => {
  const {args,fetchImpl}=harness()
  fetchImpl.mockResolvedValueOnce({ok:true,status:200,json:async()=>[{supported:false}]} as never)
  await expect(runHr('rehearse',args)).rejects.toThrow('requires PostgreSQL 17')
  expect(fetchImpl).toHaveBeenCalledOnce()
 })
 it('sanitizes uncertain HTTP failures', async () => {
  const {args,fetchImpl}=harness()
  fetchImpl.mockRejectedValueOnce(new Error('private provider response'))
  await expect(runHr('rehearse',args)).rejects.toThrow('transport outcome uncertain')
 })
 it('retains transaction, statement, lock and total time bounds', () => {
  expect(HR_LIMITS).toMatchObject({httpMs:20000,transactionMs:15000,statementMs:12000,lockMs:5000,idleTransactionMs:5000,idleSessionMs:30000,runMs:180000})
  for(const setting of ['transaction_timeout','statement_timeout','lock_timeout']) expect(buildHrPostRollbackSql()).toContain('set local '+setting)
 })
 it('only builds ordered operations inside rollback, with no committed actors', () => {
  const ordered=buildHrOrderedCase('name','edit-first')
  expect(ordered.firstOperation).toContain('public.update_employee_profile(')
  expect(ordered.secondOperation).toContain('HR_EXPECTED_PROFILE_CONFLICT')
  expect(Object.keys(ordered).sort()).toEqual(['firstOperation','postcondition','secondOperation'])
  expect(buildHrSql('rehearse',owner,{cwd})).not.toContain('pg_sleep')
 })
})
