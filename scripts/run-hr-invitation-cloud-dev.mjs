import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_DEV_PROJECT_REF, assertCloudDevTarget } from './assert-cloud-dev-target.mjs'
import { readDedicatedSupabaseDevAccessToken } from './run-supabase-dev.mjs'

export const HR_LIMITS = Object.freeze({
  httpMs: 20_000, transactionMs: 15_000, statementMs: 12_000,
  lockMs: 5_000, idleTransactionMs: 5_000,
  idleSessionMs: 30_000,
  runMs: 180_000,
})
export const HR_COMMITTED_FIXTURE_BLOCKER = 'HR_COMMITTED_FIXTURES_DISABLED_CONCURRENCY_DEFERRED'
export const HR_SCENARIOS = ['name', 'department', 'position', 'hire-date', 'termination']
const FIXTURE_RELATIONS = ["auth.users","public.tenants","public.companies","public.tenant_memberships","public.role_permissions","public.company_memberships","public.company_role_assignments","public.roles","public.departments","public.positions","public.employees","public.employee_private_details","public.audit_events"]
function emptyState(row) {
 return row?.fixture_counts && FIXTURE_RELATIONS.every(table=>row.fixture_counts[table]===0)
  && /^[a-f0-9]{32}$/.test(row.function_hash) && /^[a-f0-9]{32}$/.test(row.guards_hash)
}
const SQL_DIRECTORY = 'supabase/tests/hr-invitation'
const MIGRATION = 'supabase/migrations/20261004140132_hr_invitation_profile_guard.sql'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function runId(value) {
  if (!UUID.test(value)) throw new Error('Invalid HR fixture run ID')
  return value.toLowerCase()
}
function loadSql(name, cwd) {
  const allowed = ['fixture', 'checks', 'cleanup', 'reset', 'ownership', 'verify', 'closure', 'fk-closure']
  if (!allowed.includes(name)) throw new Error('Unknown HR SQL fixture')
  const sql = readFileSync(resolve(cwd, SQL_DIRECTORY, name + '.sql'), 'utf8').replace(/\r\n?/g, '\n').trim()
  if (!sql.startsWith('-- HR INVITATION FIXED OWNED FIXTURE')) throw new Error('Missing HR fixture marker')
  if (/\b(?:commit|rollback|begin)\s*;|supabase_migrations|\b(?:truncate|alter\s+table)\b/i.test(sql)) throw new Error('Forbidden HR fixture SQL')
  return sql
}
function envelope(sql) {
  return `begin;
set local transaction_timeout = '15s';
set local statement_timeout = '12s';
set local lock_timeout = '5s';
set local idle_in_transaction_session_timeout = '5s';
set local idle_session_timeout = '30s';
${sql}
rollback;`
}
function substitute(sql, owner) {
  return sql.replaceAll('__RUN_ID__', runId(owner))
}
export function buildHrSql(mode, owner, { cwd = process.cwd() } = {}) {
  runId(owner)
  if(['setup','reset','cleanup','verify'].includes(mode)) throw new Error(HR_COMMITTED_FIXTURE_BLOCKER)
  const ownership = (lock,absent,retained) => substitute(loadSql('ownership',cwd),owner)
    .replaceAll('__LOCK_PARENTS__',String(lock)).replaceAll('__ALLOW_ABSENT__',String(absent)).replaceAll('__ALLOW_RETAINED__',String(retained))
  if (mode !== 'rehearse') throw new Error('Unknown HR SQL mode')
  const migration = readFileSync(resolve(cwd, MIGRATION), 'utf8').replace(/\r\n?/g, '\n').trim()
  if (!migration.startsWith('create or replace function private.complete_employee_onboarding(')
    || /\b(?:commit|rollback|begin)\s*;/i.test(migration)) throw new Error('Unexpected HR migration')
  const lifecycle = [migration,substitute(loadSql('fixture',cwd),owner),substitute(loadSql('checks',cwd),owner),ownership(true,false,false),substitute(loadSql('fk-closure',cwd),owner)]
    for(const scenario of HR_SCENARIOS) for(const order of ['edit-first','onboard-first']) {
    const ordered=buildHrOrderedCase(scenario,order)
    lifecycle.push(substitute(loadSql('reset',cwd),owner),actorSql(owner),ordered.firstOperation,ordered.secondOperation,
      `do $state$ begin ${ordered.postcondition} end $state$;`)
  }
  lifecycle.push(ownership(true,false,false),substitute(loadSql('fk-closure',cwd),owner),substitute(loadSql('closure',cwd),owner),ownership(true,false,false),substitute(loadSql('fk-closure',cwd),owner),
    "select 'HR_REHEARSE' as result, (select jsonb_build_object('auth.users',(select count(*) from auth.users p where p.id in ('8a041004-0000-4000-8000-000000000001','8a041004-0000-4000-8000-000000000002','8b041004-0000-4000-8000-000000000001')),'public.tenants',(select count(*) from public.tenants p where p.id in ('8a041004-0000-4000-8000-000000000010','8b041004-0000-4000-8000-000000000010')),'public.companies',(select count(*) from public.companies p where p.id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.tenant_memberships',(select count(*) from public.tenant_memberships p where p.tenant_id in ('8a041004-0000-4000-8000-000000000010','8b041004-0000-4000-8000-000000000010')),'public.role_permissions',(select count(*) from public.role_permissions p where p.role_id in ('8a041004-0000-4000-8000-000000000301','8a041004-0000-4000-8000-000000000302','8b041004-0000-4000-8000-000000000302')),'public.company_memberships',(select count(*) from public.company_memberships p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.company_role_assignments',(select count(*) from public.company_role_assignments p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.roles',(select count(*) from public.roles p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.departments',(select count(*) from public.departments p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.positions',(select count(*) from public.positions p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.employees',(select count(*) from public.employees p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.employee_private_details',(select count(*) from public.employee_private_details p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.audit_events',(select count(*) from public.audit_events p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')))) as retained_counts_before_rollback, (select count(*) from public.audit_events where request_id='"+runId(owner)+"') as retained_audits_before_rollback;")
  return envelope(lifecycle.join('\n'))
}
export function buildHrPostRollbackSql() {
 return "begin; set local transaction_timeout='15s'; set local statement_timeout='12s'; set local lock_timeout='5s'; set local idle_in_transaction_session_timeout='5s'; set local idle_session_timeout='30s'; select jsonb_build_object('auth.users',(select count(*) from auth.users p where p.id in ('8a041004-0000-4000-8000-000000000001','8a041004-0000-4000-8000-000000000002','8b041004-0000-4000-8000-000000000001')),'public.tenants',(select count(*) from public.tenants p where p.id in ('8a041004-0000-4000-8000-000000000010','8b041004-0000-4000-8000-000000000010')),'public.companies',(select count(*) from public.companies p where p.id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.tenant_memberships',(select count(*) from public.tenant_memberships p where p.tenant_id in ('8a041004-0000-4000-8000-000000000010','8b041004-0000-4000-8000-000000000010')),'public.role_permissions',(select count(*) from public.role_permissions p where p.role_id in ('8a041004-0000-4000-8000-000000000301','8a041004-0000-4000-8000-000000000302','8b041004-0000-4000-8000-000000000302')),'public.company_memberships',(select count(*) from public.company_memberships p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.company_role_assignments',(select count(*) from public.company_role_assignments p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.roles',(select count(*) from public.roles p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.departments',(select count(*) from public.departments p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.positions',(select count(*) from public.positions p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.employees',(select count(*) from public.employees p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.employee_private_details',(select count(*) from public.employee_private_details p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020')),'public.audit_events',(select count(*) from public.audit_events p where p.company_id in ('8a041004-0000-4000-8000-000000000020','8b041004-0000-4000-8000-000000000020'))) as fixture_counts, (select count(*) from supabase_migrations.schema_migrations where version='20261004140132') as migration_applied, (select md5(pg_get_functiondef('private.complete_employee_onboarding(uuid,uuid,text,text,text,uuid,uuid,date)'::regprocedure))) as function_hash, (select md5(string_agg(pg_get_triggerdef(t.oid)||pg_get_functiondef(t.tgfoid),E'\\n' order by t.oid)) from pg_trigger t where not t.tgisinternal and t.tgrelid in ('auth.users'::regclass,'public.tenants'::regclass,'public.companies'::regclass,'public.tenant_memberships'::regclass,'public.role_permissions'::regclass,'public.company_memberships'::regclass,'public.company_role_assignments'::regclass,'public.roles'::regclass,'public.departments'::regclass,'public.positions'::regclass,'public.employees'::regclass,'public.employee_private_details'::regclass,'public.audit_events'::regclass)) as guards_hash; commit;"
}

const TARGET = "'8a041004-0000-4000-8000-000000000002'::uuid"
const COMPANY = "'8a041004-0000-4000-8000-000000000020'::uuid"
const ACTOR = '8a041004-0000-4000-8000-000000000001'
const call = `public.complete_employee_onboarding(${COMPANY}, ${TARGET}, 'HR-FIXTURE', 'HR Fixture',
 'target@hr-reissue.invalid', '8a041004-0000-4000-8000-000000000201'::uuid,
 '8a041004-0000-4000-8000-000000000211'::uuid, '2026-10-01'::date)`
const updates = {
  name: "full_name = 'Changed Fixture'",
  department: "department_id = '8a041004-0000-4000-8000-000000000202'::uuid",
  position: "position_id = '8a041004-0000-4000-8000-000000000212'::uuid",
  'hire-date': "hire_date = '2026-10-02'::date",
  termination: "employment_status = 'terminated'",
}
function actorSql(owner) {
  return `select set_config('request.headers', '{"x-request-id":"${runId(owner)}"}', true);
select set_config('request.jwt.claims', '{"sub":"${ACTOR}","role":"authenticated"}', true);`
}
export function buildHrOrderedCase(scenario, order) {
  if (!HR_SCENARIOS.includes(scenario) || !['edit-first', 'onboard-first'].includes(order)) throw new Error('Unknown HR ordered case')
  const patches = {
    name: { fullName: 'Changed Fixture' },
    department: { departmentId: '8a041004-0000-4000-8000-000000000202' },
    position: { positionId: '8a041004-0000-4000-8000-000000000212' },
    'hire-date': { hireDate: '2026-10-02' },
  }
  const employeeId = `(select id from public.employees where company_id=${COMPANY} and user_id=${TARGET})`
  const edit = scenario === 'termination'
    ? `select public.offboard_employee(${COMPANY}, ${employeeId}, 'HR fixture race');`
    : `select public.update_employee_profile(${COMPANY}, ${employeeId}, '${JSON.stringify(patches[scenario])}'::jsonb);`
  const success = `select ${call};`
  const rejected = `do $assert$ declare rejected boolean := false; begin
  begin perform ${call};
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'EMPLOYEE_EMAIL_CONFLICT' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'HR_EXPECTED_PROFILE_CONFLICT'; end if;
end $assert$;`
  const first = order === 'edit-first' ? edit : success
  const second = order === 'edit-first' ? rejected : edit
  const assertion = scenario === 'termination'
    ? `if (select employment_status from public.employees where company_id=${COMPANY} and user_id=${TARGET}) is distinct from 'terminated'
       or exists(select 1 from public.company_memberships where company_id=${COMPANY} and user_id=${TARGET} and is_active)
       or exists(select 1 from public.company_role_assignments where company_id=${COMPANY} and user_id=${TARGET} and revoked_at is null)
       then raise exception 'HR_OFFBOARDING_STATE_MISMATCH'; end if;`
    : `if not exists(select 1 from public.employees where company_id=${COMPANY} and user_id=${TARGET} and ${updates[scenario]})
       then raise exception 'HR_PROFILE_EDIT_LOST'; end if; if not exists(select 1 from public.company_memberships where company_id=${COMPANY} and user_id=${TARGET} and is_active) or (select count(*) from public.company_role_assignments where company_id=${COMPANY} and user_id=${TARGET} and role_id='8a041004-0000-4000-8000-000000000301' and revoked_at is null)<>1 then raise exception 'HR_ACTIVE_ACCESS_MISMATCH'; end if;`
  return { firstOperation: first, secondOperation: second, postcondition: assertion }
}
export async function runHr(mode, {
 owner = randomUUID(), cwd = process.cwd(), fetchImpl = globalThis.fetch,
 guard = assertCloudDevTarget, tokenReader = readDedicatedSupabaseDevAccessToken,
} = {}) {
 owner = runId(owner)
 if (!['rehearse','concurrency','cleanup'].includes(mode)) throw new Error('Unknown HR operation')
 guard({ cwd })
 if(mode !== 'rehearse') throw new Error(HR_COMMITTED_FIXTURE_BLOCKER)
 const token = tokenReader(cwd)
 const controller = new AbortController()
 const timer = setTimeout(() => controller.abort(), HR_LIMITS.runMs)
 async function query(sql, label, { timeout = HR_LIMITS.httpMs, readOnly = false } = {}) {
  let response
  try {
   response = await fetchImpl(`https://api.supabase.com/v1/projects/${CANONICAL_DEV_PROJECT_REF}/database/query`, {
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({query:sql,read_only:readOnly}),
    signal:AbortSignal.any([controller.signal,AbortSignal.timeout(timeout)]),
   })
  } catch { throw new Error('HR '+label+' transport outcome uncertain; retain run ID '+owner) }
  if (!response.ok) throw new Error('HR '+label+' failed; HTTP '+response.status)
  let rows
  try { rows=await response.json() } catch { throw new Error('HR '+label+' malformed response') }
  if (!Array.isArray(rows)) throw new Error('HR '+label+' malformed response')
  return rows
 }
 async function checked(sql,label,options) {
  const rows=await query(sql,label,options)
  if (!rows.some(row=>row?.result===label)) throw new Error('HR '+label+' missing completion evidence')
  return rows
 }
 console.log('HR fixture run ID: '+owner)
 try {
  const version=await query("begin; set local statement_timeout='12s'; set local lock_timeout='5s'; set local idle_in_transaction_session_timeout='5s'; select current_setting('server_version_num')::integer >= 170000 as supported; commit;",'version',{readOnly:true})
  if(!version.some(row=>row?.supported===true)) throw new Error('HR requires PostgreSQL 17 transaction timeout')
  if(mode==='rehearse') {
   const before=(await query(buildHrPostRollbackSql(),'baseline',{readOnly:true}))[0]
   if(!emptyState(before) || before.migration_applied!==0) throw new Error('HR baseline is not empty/unapplied')
   const rows=await checked(buildHrSql('rehearse',owner,{cwd}),'HR_REHEARSE')
   const after=(await query(buildHrPostRollbackSql(),'post-rollback',{readOnly:true}))[0]
   if(!emptyState(after)
    || after.migration_applied!==before.migration_applied || after.function_hash!==before.function_hash || after.guards_hash!==before.guards_hash) throw new Error('HR rollback reconciliation failed; retain run ID '+owner)
   const evidence={retention:rows.find(row=>row?.result==='HR_REHEARSE'),postRollback:after}
   console.log('HR rollback evidence: '+JSON.stringify(evidence))
   return {owner,ok:true,...evidence}
  }
 } finally {
  controller.abort()
  clearTimeout(timer)
 }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const [mode,suppliedOwner,...extra]=process.argv.slice(2)
 if(extra.length || (mode==='cleanup' ? !suppliedOwner : suppliedOwner!==undefined)) throw new Error('Unsupported HR operation arguments')
 try {await runHr(mode,suppliedOwner ? {owner:suppliedOwner}:{})}
 catch(error) {console.error(error.message);process.exitCode=1}
}
