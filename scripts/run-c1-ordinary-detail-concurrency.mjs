import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_DEV_PROJECT_REF, assertCloudDevTarget } from './assert-cloud-dev-target.mjs'
import { readDedicatedSupabaseDevAccessToken } from './run-supabase-dev.mjs'

const marker = '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE'
const phases = new Set(['setup', 'actor_a', 'actor_b', 'assert', 'cleanup'])
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

export function validateC1OrdinaryDetailConcurrencySql(phase, sql) {
  if (!phases.has(phase) || !sql.startsWith(marker)) throw new Error('Invalid C1 ordinary-detail concurrency fixture')
  const ids = sql.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
  if (ids.some(id => !id.toLowerCase().startsWith('c1f'))) throw new Error('C1 ordinary-detail concurrency fixture must use reserved synthetic identifiers')
  if (/\b(delete|update)\s+from?\s+public\.[a-z_]+\s*;/iu.test(sql) || /\b(drop|truncate|reset|repair)\b/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency fixture contains a broad delete or forbidden operation')
  if (phase === 'cleanup' && !/delete\s+from\s+public\.tenants\s+where\s+id\s*=\s*'c1f/iu.test(sql)) throw new Error('C1 ordinary-detail concurrency cleanup must be exact-scope')
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
    const [a, b] = await Promise.all([execute('actor_a'), execute('actor_b')])
    if (!a?.parentId || a.parentId !== b?.parentId) throw new Error('C1 ordinary-detail concurrency actors must return the same parent ID')
    const assertion = await execute('assert')
    if (assertion?.parentCount !== 1) throw new Error('C1 ordinary-detail concurrency requires exactly one parent')
  } catch (error) { failure = error }
  try { await execute('cleanup') } catch (error) { throw error }
  if (failure) throw failure
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runC1OrdinaryDetailConcurrency()
