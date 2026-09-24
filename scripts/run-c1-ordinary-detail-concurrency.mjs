import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_DEV_PROJECT_REF, assertCloudDevTarget } from './assert-cloud-dev-target.mjs'
import { readDedicatedSupabaseDevAccessToken } from './run-supabase-dev.mjs'

const marker = '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE'
const phases = new Set(['setup', 'actor_a', 'actor_b', 'assert', 'cleanup'])
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const exactCleanupSql = `${marker}
delete from public.tenants where id = 'c1f10000-0000-4000-8000-000000000010';
delete from auth.users where id = 'c1f10000-0000-4000-8000-000000000903';`

export function validateC1OrdinaryDetailConcurrencySql(phase, sql) {
  if (!phases.has(phase) || !sql.startsWith(marker)) throw new Error('Invalid C1 ordinary-detail concurrency fixture')
  const ids = sql.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
  if (ids.some(id => !id.toLowerCase().startsWith('c1f'))) throw new Error('C1 ordinary-detail concurrency fixture must use reserved synthetic identifiers')
  const hasExactTenantCleanup = sql.includes("delete from public.tenants where id = 'c1f10000-0000-4000-8000-000000000010';")
  const hasExactAuthUserCleanup = sql.includes("delete from auth.users where id = 'c1f10000-0000-4000-8000-000000000903';")
  if (/\bupdate\b/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency fixture contains a broad update or forbidden operation')
  if (phase === 'cleanup' && hasExactTenantCleanup && !hasExactAuthUserCleanup) throw new Error('C1 ordinary-detail concurrency cleanup must delete the exact auth user')
  if (/\bdelete\b/iu.test(sql) && (phase !== 'cleanup' || sql !== exactCleanupSql)) throw new Error('C1 ordinary-detail concurrency fixture contains a broad delete or forbidden operation; only exact approved cleanup DELETE statements are allowed')
  if (phase === 'cleanup' && sql !== exactCleanupSql) throw new Error('C1 ordinary-detail concurrency cleanup must contain only exact approved DELETE statements')
  if (/\b(drop|truncate|reset|repair)\b/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency fixture contains a forbidden operation')
  if (phase === 'actor_a' && !/\bbegin\s*;[\s\S]*private\.c1_resolve_or_create_ordinary_project_cost_item[\s\S]*pg_catalog\.pg_sleep\s*\([\s\S]*\)[\s\S]*\bcommit\s*;/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency actor A requires a transaction-held resolver lock')
  if (phase === 'actor_b' && !/\bbegin\s*;[\s\S]*pg_catalog\.pg_try_advisory_lock\s*\([\s\S]*c1_ordinary_cost_parent:[\s\S]*\)[\s\S]*private\.c1_resolve_or_create_ordinary_project_cost_item[\s\S]*\bcommit\s*;/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency actor B requires an actor A readiness barrier')
}

function defaultReadPhase(phase) {
  const sql = readFileSync(resolve(root, 'supabase/tests/database/c1_ordinary_detail_concurrency', `${phase}.sql`), 'utf8').replace(/\r\n?/g, '\n').trim()
  validateC1OrdinaryDetailConcurrencySql(phase, sql)
  return sql
}

async function defaultRunPhase(phase, sql, { cwd = process.cwd(), fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${CANONICAL_DEV_PROJECT_REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${readDedicatedSupabaseDevAccessToken(cwd)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: false }), signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body) throw new Error(`C1 ordinary-detail concurrency ${phase} failed`)
  const row = Array.isArray(body) ? body[0] : body
  return phase.startsWith('actor_') ? { parentId: row?.parent_id } : phase === 'assert' ? { parentCount: row?.parent_count } : {}
}

export async function runC1OrdinaryDetailConcurrency({ cwd = process.cwd(), assertTarget = () => assertCloudDevTarget({ cwd }), readPhase = defaultReadPhase, runPhase } = {}) {
  assertTarget()
  const run = runPhase ?? ((phase, sql) => defaultRunPhase(phase, sql, { cwd }))
  const execute = phase => run(phase, readPhase(phase))
  let failure
  try {
    await execute('cleanup'); await execute('setup')
    const actors = await Promise.allSettled([execute('actor_a'), execute('actor_b')])
    const actorFailures = actors.flatMap(actor => actor.status === 'rejected' ? [actor.reason] : [])
    if (actorFailures.length) throw new AggregateError(actorFailures, `C1 ordinary-detail concurrency actors failed: ${actorFailures.map(error => error instanceof Error ? error.message : String(error)).join('; ')}`)
    const [a, b] = actors.map(actor => actor.value)
    if (!a?.parentId || a.parentId !== b?.parentId) throw new Error('C1 ordinary-detail concurrency actors must return the same parent ID')
    const assertion = await execute('assert')
    if (assertion?.parentCount !== 1) throw new Error('C1 ordinary-detail concurrency requires exactly one parent')
  } catch (error) { failure = error }
  try { await execute('cleanup') } catch (error) { throw error }
  if (failure) throw failure
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runC1OrdinaryDetailConcurrency()
