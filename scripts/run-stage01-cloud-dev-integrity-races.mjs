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
const FIXED_MARKER = '-- STAGE01 CLOUD DEV FIXED INTEGRITY RACE FIXTURE'
const COMMON_MARKER = '-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE'
const GATE_ERROR = 'STAGE01_INTAKE_GATES_NOT_SATISFIED'

export const STAGE01_INTEGRITY_RACE_SCENARIOS = Object.freeze([
  {
    name: 'completion-first',
    actorAOutcome: { ok: true },
    actorBOutcome: { ok: true },
  },
  {
    name: 'contact-update-first',
    actorAOutcome: { ok: true },
    actorBOutcome: { ok: false, code: GATE_ERROR },
  },
])

const FIXED_SCENARIO_NAMES = new Set(
  STAGE01_INTEGRITY_RACE_SCENARIOS.map(scenario => scenario.name),
)

function readFixedSql(scenario, phase, cwd) {
  if (!FIXED_SCENARIO_NAMES.has(scenario) || !FIXED_PHASES.has(phase)) {
    throw new Error('Unsupported Stage 01 integrity race operation')
  }
  const phaseSql = readFileSync(
    resolve(cwd, 'supabase/tests/database/stage01_integrity_races', scenario, `${phase}.sql`),
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
  if (!phaseSql.startsWith(FIXED_MARKER)
      || (phase === 'setup' && !sql.startsWith(COMMON_MARKER))) {
    throw new Error('Stage 01 integrity race SQL is missing its fixed-fixture marker')
  }
  if (/supabase_migrations|\bmigration\s+repair\b|\bdb\s+reset\b|\binclude-seed\b/iu.test(sql)) {
    throw new Error('Stage 01 integrity race SQL contains a forbidden Cloud DEV operation')
  }
  return sql
}

function containsExactGateError(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.message === 'string'
    && new RegExp(`(?:^|[^A-Z0-9_])${GATE_ERROR}(?:$|[^A-Z0-9_])`, 'u').test(value.message),
  )
}

function managementFailure(scenario, phase, status) {
  return new Error(`Management API ${scenario}/${phase} failed with status ${status}`)
}

export async function runStage01IntegrityManagementQuery(scenario, phase, {
  cwd = process.cwd(),
  fetchImpl = globalThis.fetch,
} = {}) {
  assertCloudDevTarget({ cwd })
  const query = readFixedSql(scenario, phase, cwd)
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
    if ((phase === 'actor_a' || phase === 'actor_b') && containsExactGateError(body)) {
      return { ok: false, code: GATE_ERROR }
    }
    throw managementFailure(scenario, phase, response.status)
  }

  console.log(`Stage 01 integrity race ${scenario}/${phase}: PASS`)
  return { ok: true }
}

function matchesOutcome(actual, expected) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false
  const actualKeys = Object.keys(actual)
  const expectedKeys = Object.keys(expected)
  return actualKeys.length === expectedKeys.length
    && expectedKeys.every(key => actual[key] === expected[key])
}

async function runScenario(scenario, runOperation) {
  let bodyError
  try {
    await runOperation(scenario.name, 'cleanup')
    await runOperation(scenario.name, 'setup')
    const runActor = phase => runOperation(scenario.name, phase).then(
      outcome => outcome,
      error => { throw error },
    )
    const actors = await Promise.allSettled([
      runActor('actor_a'),
      runActor('actor_b'),
    ])

    if (actors.some(actor => actor.status === 'rejected')) {
      throw new Error(`${scenario.name} race did not return two database outcomes`)
    }
    if (!matchesOutcome(actors[0].value, scenario.actorAOutcome)
        || !matchesOutcome(actors[1].value, scenario.actorBOutcome)) {
      throw new Error(`${scenario.name} returned an unexpected database outcome`)
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

export async function runStage01CloudDevIntegrityRaces({
  scenarios = STAGE01_INTEGRITY_RACE_SCENARIOS,
  runOperation = (scenario, phase) => runStage01IntegrityManagementQuery(scenario, phase),
} = {}) {
  for (const scenario of scenarios) await runScenario(scenario, runOperation)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Unsupported Stage 01 integrity race operation')
  await runStage01CloudDevIntegrityRaces()
}
