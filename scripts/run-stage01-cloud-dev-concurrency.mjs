import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CANONICAL_DEV_PROJECT_REF,
  assertCloudDevTarget,
} from './assert-cloud-dev-target.mjs'
import { readDedicatedSupabaseDevAccessToken } from './run-supabase-dev.mjs'

const MANAGEMENT_API_ORIGIN = 'https://api.supabase.com'
const FIXED_CONCURRENCY_FILES = {
  'stage01-concurrency-setup': 'supabase/tests/database/stage01_concurrency_setup.sql',
  'stage01-concurrency-actor-a': 'supabase/tests/database/stage01_concurrency_actor_a.sql',
  'stage01-concurrency-actor-b': 'supabase/tests/database/stage01_concurrency_actor_b.sql',
  'stage01-concurrency-assert': 'supabase/tests/database/stage01_concurrency_assert.sql',
  'stage01-concurrency-cleanup': 'supabase/tests/database/stage01_concurrency_cleanup.sql',
}

function readFixedConcurrencySql(mode, cwd) {
  const relativePath = FIXED_CONCURRENCY_FILES[mode]
  if (!relativePath) throw new Error('Unsupported Stage 01 concurrency operation')
  const sql = readFileSync(resolve(cwd, relativePath), 'utf8').replace(/\r\n?/g, '\n').trim()
  if (!sql.startsWith('-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE')) {
    throw new Error('Stage 01 concurrency SQL is missing its fixed-fixture marker')
  }
  if (/supabase_migrations|\bmigration\s+repair\b|\bdb\s+reset\b|\binclude-seed\b/iu.test(sql)) {
    throw new Error('Stage 01 concurrency SQL contains a forbidden Cloud DEV operation')
  }
  return sql
}

export async function runStage01ManagementQuery(mode, {
  cwd = process.cwd(),
  fetchImpl = globalThis.fetch,
} = {}) {
  assertCloudDevTarget({ cwd })
  const query = readFixedConcurrencySql(mode, cwd)
  const accessToken = readDedicatedSupabaseDevAccessToken(cwd)
  const response = await fetchImpl(
    `${MANAGEMENT_API_ORIGIN}/v1/projects/${CANONICAL_DEV_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, read_only: false }),
      signal: AbortSignal.timeout(20_000),
    },
  )
  if (!response.ok) {
    throw new Error(`Management API ${mode} failed with status ${response.status}`)
  }
  console.log(`Stage 01 concurrency mode ${mode} completed through Management API.`)
}

export async function runStage01CloudDevConcurrency({
  runMode = mode => runStage01ManagementQuery(mode),
} = {}) {
  await runMode('stage01-concurrency-cleanup')
  let bodyError
  try {
    await runMode('stage01-concurrency-setup')
    const actors = await Promise.allSettled([
      runMode('stage01-concurrency-actor-a'),
      runMode('stage01-concurrency-actor-b'),
    ])
    const successCount = actors.filter(result => result.status === 'fulfilled').length
    if (successCount !== 1) throw new Error('Stage 01 concurrency requires exactly one actor must succeed')
    await runMode('stage01-concurrency-assert')
  } catch (error) {
    bodyError = error
  }

  await runMode('stage01-concurrency-cleanup')
  if (bodyError) throw bodyError
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Unsupported Stage 01 concurrency operation')
  await runStage01CloudDevConcurrency()
}
