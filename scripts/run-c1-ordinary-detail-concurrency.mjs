import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_DEV_PROJECT_REF, assertCloudDevTarget } from './assert-cloud-dev-target.mjs'
import { readDedicatedSupabaseDevAccessToken } from './run-supabase-dev.mjs'

const marker = '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE'
const phases = new Set(['setup', 'actor_a', 'actor_b', 'assert', 'cleanup'])
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const C1_ORDINARY_DETAIL_CONCURRENCY_SCENARIOS = Object.freeze([
  { name: 'resolver-resolver', outcome: 'same-parent' },
  { name: 'direct-direct', outcome: 'same-parent' },
  { name: 'descriptive-correction-resolver', outcome: 'same-parent' },
  { name: 'legacy-create-legacy-create', outcome: 'actor-b-category-conflict' },
  { name: 'legacy-create-resolver', outcome: 'actor-b-category-conflict' },
  { name: 'legacy-recateg-resolver', outcome: 'actor-b-category-conflict' },
])
const scenariosByName = new Map(C1_ORDINARY_DETAIL_CONCURRENCY_SCENARIOS.map(scenario => [scenario.name, scenario]))
const exactCleanupSql = `-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE
begin;
alter table public.cost_categories disable trigger a_c1_finance_prepare;
alter table public.roles disable trigger roles_audit_role_catalog_change;
alter table public.role_permissions disable trigger role_permissions_audit_role_catalog_change;
alter table public.company_role_assignments disable trigger company_role_assignments_audit_employee_rbac_change;
alter table public.company_role_assignments disable trigger company_role_assignments_prevent_last_admin_removal;
alter table public.audit_events disable trigger audit_events_prevent_mutation;
delete from public.cost_command_receipts where tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020' and actor_id = 'c1f10000-0000-4000-8000-000000000903' and command_name in ('project_cost_draft.create','project_cost.correct','project_cost_detail.create_and_publish');
delete from public.project_cost_items where tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020' and project_id = 'c1f10000-0000-4000-8000-000000000102';
delete from public.cost_categories where id in ('c1f10000-0000-4000-8000-000000000301','c1f10000-0000-4000-8000-000000000302') and tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.projects where id = 'c1f10000-0000-4000-8000-000000000102' and tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.company_cost_settings where tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.company_role_assignments where tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020' and user_id = 'c1f10000-0000-4000-8000-000000000903' and role_id = 'c1f10000-0000-4000-8000-000000000913';
delete from public.role_permissions where role_id = 'c1f10000-0000-4000-8000-000000000913';
delete from public.roles where id = 'c1f10000-0000-4000-8000-000000000913' and tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.company_memberships where user_id = 'c1f10000-0000-4000-8000-000000000903' and tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.tenant_memberships where user_id = 'c1f10000-0000-4000-8000-000000000903' and tenant_id = 'c1f10000-0000-4000-8000-000000000010';
delete from public.audit_events where tenant_id = 'c1f10000-0000-4000-8000-000000000010' and company_id = 'c1f10000-0000-4000-8000-000000000020';
delete from public.companies where id = 'c1f10000-0000-4000-8000-000000000020' and tenant_id = 'c1f10000-0000-4000-8000-000000000010';
delete from public.tenants where id = 'c1f10000-0000-4000-8000-000000000010';
delete from auth.users where id = 'c1f10000-0000-4000-8000-000000000903';
alter table public.audit_events enable trigger audit_events_prevent_mutation;
alter table public.company_role_assignments enable trigger company_role_assignments_prevent_last_admin_removal;
alter table public.company_role_assignments enable trigger company_role_assignments_audit_employee_rbac_change;
alter table public.role_permissions enable trigger role_permissions_audit_role_catalog_change;
alter table public.roles enable trigger roles_audit_role_catalog_change;
alter table public.cost_categories enable trigger a_c1_finance_prepare;
commit;`

export function validateC1OrdinaryDetailConcurrencySql(phase, sql, scenarioName = 'resolver-resolver') {
  const scenario = scenariosByName.get(scenarioName)
  if (!scenario) throw new Error('Invalid C1 ordinary-detail concurrency scenario')
  if (!phases.has(phase) || !sql.startsWith(marker)) throw new Error('Invalid C1 ordinary-detail concurrency fixture')
  const ids = sql.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
  if (ids.some(id => !id.toLowerCase().startsWith('c1f'))) throw new Error('C1 ordinary-detail concurrency fixture must use reserved synthetic identifiers')
  const hasExactTenantCleanup = sql.includes("delete from public.tenants where id = 'c1f10000-0000-4000-8000-000000000010';")
  const hasExactAuthUserCleanup = sql.includes("delete from auth.users where id = 'c1f10000-0000-4000-8000-000000000903';")
  if (/\bupdate\s+(?:only\s+)?(?:[a-z_][\w]*\.)?[a-z_][\w]*/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency fixture contains a broad update or forbidden operation')
  if (phase === 'cleanup' && hasExactTenantCleanup && !hasExactAuthUserCleanup) throw new Error('C1 ordinary-detail concurrency cleanup must delete the exact auth user')
  if (/\bdelete\b/iu.test(sql) && (phase !== 'cleanup' || sql !== exactCleanupSql)) throw new Error('C1 ordinary-detail concurrency fixture contains a broad delete or forbidden operation; only exact approved cleanup DELETE statements are allowed')
  if (phase === 'cleanup' && sql !== exactCleanupSql) throw new Error('C1 ordinary-detail concurrency cleanup must contain only exact approved DELETE statements')
  if (/\b(drop|truncate|reset|repair)\b/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency fixture contains a forbidden operation')
  if (phase === 'actor_a' && !/\bbegin\s*;[\s\S]*pg_catalog\.pg_sleep\s*\([\s\S]*\)[\s\S]*\bcommit\s*;/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency actor A requires a transaction-held category lock')
  if (phase === 'actor_b' && !/\bbegin\s*;[\s\S]*pg_catalog\.pg_try_advisory_lock\s*\([\s\S]*(?:c1_project_cost_category:|c1_descriptive_parent_row_ready)[\s\S]*\)[\s\S]*\bcommit\s*;/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency actor B requires an actor A readiness barrier')
  if (phase === 'actor_a' && scenarioName === 'descriptive-correction-resolver' && (!/public\.c1_correct_published_project_cost/iu.test(sql) || !/for update/iu.test(sql) || !/c1_descriptive_parent_row_ready/iu.test(sql) || !/pg_try_advisory_lock\s*\([\s\S]*c1_project_cost_category:/iu.test(sql))) throw new Error('C1 ordinary-detail concurrency descriptive correction actor requires the reciprocal category-lock barrier')
  if (phase === 'actor_b' && scenarioName === 'descriptive-correction-resolver' && !/pg_try_advisory_lock\s*\([\s\S]*c1_descriptive_parent_row_ready[\s\S]*pg_advisory_xact_lock\s*\([\s\S]*c1_project_cost_category:[\s\S]*private\.c1_resolve_or_create_ordinary_project_cost_item/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency resolver actor requires the reciprocal parent-row barrier')
  if (phase === 'actor_a' && scenarioName === 'legacy-recateg-resolver' && !/public\.c1_update_project_cost_draft/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency recategorization actor requires legacy draft update')
  if (scenarioName === 'direct-direct' && phase.startsWith('actor_') && !/public\.c1_create_and_publish_project_cost_detail/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency direct actor must use the direct publish command')
  if (phase === 'actor_a' && !['legacy-recateg-resolver', 'descriptive-correction-resolver', 'direct-direct'].includes(scenarioName) && !(scenarioName === 'resolver-resolver' ? /private\.c1_resolve_or_create_ordinary_project_cost_item/iu : /public\.c1_create_project_cost_draft/iu).test(sql)) throw new Error('C1 ordinary-detail concurrency actor A does not match its scenario')
  if (phase === 'actor_b' && scenarioName !== 'direct-direct' && !(scenarioName === 'legacy-create-legacy-create' ? /public\.c1_create_project_cost_draft/iu : /private\.c1_resolve_or_create_ordinary_project_cost_item/iu).test(sql)) throw new Error('C1 ordinary-detail concurrency actor B does not match its scenario')
}

function defaultReadPhase(phase, scenarioName) {
  const fixtureRoot = resolve(root, 'supabase/tests/database/c1_ordinary_detail_concurrency')
  const fixturePath = phase === 'cleanup' || phase === 'setup' || (phase === 'assert' && scenarioName !== 'direct-direct') || scenarioName === 'resolver-resolver'
    ? resolve(fixtureRoot, `${phase}.sql`)
    : resolve(fixtureRoot, scenarioName, `${phase}.sql`)
  const sql = readFileSync(fixturePath, 'utf8').replace(/\r\n?/g, '\n').trim()
  validateC1OrdinaryDetailConcurrencySql(phase, sql, scenarioName)
  return sql
}

function containsExactCategoryConflict(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.message === 'string'
    && /(?:^|[^A-Z0-9_])P0001:\s*PROJECT_COST_CATEGORY_CONFLICT(?:$|[^A-Z0-9_])/u.test(value.message),
  )
}

function managementFailure(phase, status) {
  return new Error(`C1 ordinary-detail concurrency ${phase} failed with status ${status}`)
}

export async function runC1OrdinaryDetailManagementQuery(phase, sql, {
  cwd = process.cwd(),
  fetchImpl = globalThis.fetch,
  assertTarget = () => assertCloudDevTarget({ cwd }),
} = {}) {
  assertTarget()
  let response
  try {
    response = await fetchImpl(`https://api.supabase.com/v1/projects/${CANONICAL_DEV_PROJECT_REF}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${readDedicatedSupabaseDevAccessToken(cwd)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, read_only: false }), signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new Error(`C1 ordinary-detail concurrency ${phase} transport failed`)
  }
  let body
  try {
    body = JSON.parse(await response.text())
  } catch {
    throw managementFailure(phase, response.status)
  }
  if (!response.ok) {
    if (phase.startsWith('actor_') && containsExactCategoryConflict(body)) return { errorCode: 'PROJECT_COST_CATEGORY_CONFLICT' }
    throw managementFailure(phase, response.status)
  }
  const row = Array.isArray(body) ? body[0] : body
  return phase.startsWith('actor_') ? { parentId: row?.parent_id } : phase === 'assert' ? { parentCount: row?.parent_count, detailCount: row?.detail_count, publishedCount: row?.published_count, distinctLineCount: row?.distinct_line_count, amountText: row?.amount_text, directReceiptCount: row?.direct_receipt_count, directAuditCount: row?.direct_audit_count } : {}
}

export async function runC1OrdinaryDetailConcurrency({ cwd = process.cwd(), assertTarget = () => assertCloudDevTarget({ cwd }), readPhase = defaultReadPhase, runPhase, scenarios = C1_ORDINARY_DETAIL_CONCURRENCY_SCENARIOS } = {}) {
  assertTarget()
  const run = runPhase ?? ((phase, sql) => runC1OrdinaryDetailManagementQuery(phase, sql, { cwd, assertTarget: () => {} }))
  for (const scenario of scenarios) {
    if (!scenariosByName.has(scenario.name)) throw new Error('Invalid C1 ordinary-detail concurrency scenario')
    const execute = phase => run(phase, readPhase(phase, scenario.name), scenario)
    let failure
    try {
      await execute('cleanup'); await execute('setup')
      const actors = await Promise.allSettled([execute('actor_a'), execute('actor_b')])
      const actorFailures = actors.flatMap(actor => actor.status === 'rejected' ? [actor.reason] : [])
      if (actorFailures.length) throw new AggregateError(actorFailures, `C1 ordinary-detail concurrency actors failed: ${actorFailures.map(error => error instanceof Error ? error.message : String(error)).join('; ')}`)
      const [a, b] = actors.map(actor => actor.value)
      if (scenario.outcome === 'same-parent') {
        if (!a?.parentId || a.parentId !== b?.parentId) throw new Error('C1 ordinary-detail concurrency actors must return the same parent ID')
      } else if (!a?.parentId || b?.errorCode !== 'PROJECT_COST_CATEGORY_CONFLICT') {
        throw new Error('C1 ordinary-detail concurrency requires one parent and a PROJECT_COST_CATEGORY_CONFLICT loser')
      }
      const assertion = await execute('assert')
      if (assertion?.parentCount !== 1) throw new Error('C1 ordinary-detail concurrency requires exactly one parent')
      if (scenario.name === 'direct-direct' && (assertion?.detailCount !== 2 || assertion?.publishedCount !== 2 || assertion?.distinctLineCount !== 2 || assertion?.amountText !== '3.0000' || assertion?.directReceiptCount !== 2 || assertion?.directAuditCount !== 2)) throw new Error('C1 ordinary-detail direct concurrency requires two published details, distinct lines, exact aggregate, and two direct histories')
    } catch (error) { failure = error }
    await execute('cleanup')
    if (failure) throw failure
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runC1OrdinaryDetailConcurrency()
