import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CANONICAL_DEV_PROJECT_REF,
  assertCloudDevTarget,
} from './assert-cloud-dev-target.mjs'
import { readDedicatedSupabaseDevAccessToken } from './run-supabase-dev.mjs'

const MANAGEMENT_API_ORIGIN = 'https://api.supabase.com'
const FIXED_PHASES = new Set(['setup', 'actor_a', 'actor_b', 'assert', 'cleanup'])
const FIXED_MARKER = '-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE'

export const STAGE01_CONCURRENCY_SCENARIOS = Object.freeze([
  {
    name: 'opportunity-update',
    rpc: 'public.update_opportunity_current_data',
    versionKeys: ['expectedOpportunityVersion'],
  },
  {
    name: 'primary-contact',
    rpc: 'public.set_opportunity_primary_contact',
    versionKeys: ['expectedOpportunityVersion'],
  },
  {
    name: 'primary-referrer',
    rpc: 'public.set_opportunity_primary_referrer',
    versionKeys: ['expectedOpportunityVersion'],
  },
  {
    name: 'duplicate-resolution',
    rpc: 'public.resolve_opportunity_duplicate',
    versionKeys: ['expectedOpportunityVersion'],
  },
  {
    name: 'contact-update',
    rpc: 'public.update_contact',
    versionKeys: ['expectedContactVersion'],
  },
  {
    name: 'intake-complete',
    rpc: 'public.complete_stage01_intake',
    versionKeys: ['expectedOpportunityVersion', 'expectedExecutionVersion'],
  },
  {
    name: 'node-execution',
    rpc: 'public.assign_workflow_node',
    versionKeys: ['expectedExecutionVersion'],
  },
  {
    name: 'final-decision',
    rpc: 'public.record_stage01_final_decision',
    versionKeys: ['expectedCycleVersion'],
  },
  {
    name: 'reactivation',
    rpc: 'public.reactivate_stage01',
    versionKeys: ['expectedOpportunityVersion', 'expectedExecutionVersion', 'expectedCycleVersion'],
  },
])

const FIXED_SCENARIO_NAMES = new Set(STAGE01_CONCURRENCY_SCENARIOS.map(scenario => scenario.name))

function readFixedConcurrencySql(scenario, phase, cwd) {
  if (!FIXED_SCENARIO_NAMES.has(scenario) || !FIXED_PHASES.has(phase)) {
    throw new Error('Unsupported Stage 01 concurrency operation')
  }
  const phaseSql = readFileSync(
    resolve(cwd, 'supabase/tests/database/stage01_concurrency', scenario, `${phase}.sql`),
    'utf8',
  ).replace(/\r\n?/g, '\n').trim()
  let sql = phaseSql
  if (phase === 'setup') {
    const commonSetup = readFileSync(
      resolve(cwd, 'supabase/tests/database/stage01_concurrency/common_setup.sql'),
      'utf8',
    ).replace(/\r\n?/g, '\n').trim()
    sql = `${commonSetup}\n${phaseSql}`
  } else if (phase === 'cleanup') {
    const commonCleanup = readFileSync(
      resolve(cwd, 'supabase/tests/database/stage01_concurrency/common_cleanup.sql'),
      'utf8',
    ).replace(/\r\n?/g, '\n').trim()
    sql = `${phaseSql}\n${commonCleanup}`
  }
  if (!sql.startsWith(FIXED_MARKER)) {
    throw new Error('Stage 01 concurrency SQL is missing its fixed-fixture marker')
  }
  if (/supabase_migrations|\bmigration\s+repair\b|\bdb\s+reset\b|\binclude-seed\b/iu.test(sql)) {
    throw new Error('Stage 01 concurrency SQL contains a forbidden Cloud DEV operation')
  }
  return sql
}

function containsExactVersionConflict(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.message === 'string'
    && /(?:^|[^A-Z0-9_])VERSION_CONFLICT(?:$|[^A-Z0-9_])/u.test(value.message),
  )
}

function managementFailure(scenario, phase, status) {
  return new Error(`Management API ${scenario}/${phase} failed with status ${status}`)
}

export async function runStage01ManagementQuery(scenario, phase, {
  cwd = process.cwd(),
  fetchImpl = globalThis.fetch,
} = {}) {
  assertCloudDevTarget({ cwd })
  const query = readFixedConcurrencySql(scenario, phase, cwd)
  const accessToken = readDedicatedSupabaseDevAccessToken(cwd)
  let response
  try {
    response = await fetchImpl(
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
  } catch {
    throw new Error(`Management API ${scenario}/${phase} transport failed`)
  }

  let body
  try {
    body = JSON.parse(await response.text())
  } catch {
    if (!response.ok) throw managementFailure(scenario, phase, response.status)
    throw new Error(`Management API ${scenario}/${phase} returned malformed response`)
  }

  if (!response.ok) {
    if ((phase === 'actor_a' || phase === 'actor_b') && containsExactVersionConflict(body)) {
      return { ok: false, code: 'VERSION_CONFLICT' }
    }
    throw managementFailure(scenario, phase, response.status)
  }

  console.log(`Stage 01 concurrency ${scenario}/${phase}: PASS`)
  return { ok: true }
}

function isSuccess(outcome) {
  return outcome && outcome.ok === true && Object.keys(outcome).length === 1
}

function isVersionConflict(outcome) {
  return outcome
    && outcome.ok === false
    && outcome.code === 'VERSION_CONFLICT'
    && Object.keys(outcome).length === 2
}

async function runScenario(scenario, runOperation) {
  let bodyError
  try {
    await runOperation(scenario.name, 'cleanup')
    await runOperation(scenario.name, 'setup')
    const actors = await Promise.allSettled([
      runOperation(scenario.name, 'actor_a'),
      runOperation(scenario.name, 'actor_b'),
    ])

    if (actors.some(actor => actor.status === 'rejected')) {
      throw new Error(`${scenario.name} race did not return two database outcomes`)
    }
    const outcomes = actors.map(actor => actor.value)
    const successCount = outcomes.filter(isSuccess).length
    const conflictCount = outcomes.filter(isVersionConflict).length
    if (successCount !== 1 || conflictCount !== 1) {
      throw new Error(`${scenario.name} requires exactly one success and one VERSION_CONFLICT`)
    }
    await runOperation(scenario.name, 'assert')
  } catch (error) {
    bodyError = error
  }

  let cleanupError
  try {
    await runOperation(scenario.name, 'cleanup')
  } catch (error) {
    cleanupError = error
  }
  if (cleanupError) throw cleanupError
  if (bodyError) throw bodyError
}

export async function runStage01CloudDevConcurrency({
  scenarios = STAGE01_CONCURRENCY_SCENARIOS,
  runOperation = (scenario, phase) => runStage01ManagementQuery(scenario, phase),
} = {}) {
  for (const scenario of scenarios) {
    await runScenario(scenario, runOperation)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Unsupported Stage 01 concurrency operation')
  await runStage01CloudDevConcurrency()
}
