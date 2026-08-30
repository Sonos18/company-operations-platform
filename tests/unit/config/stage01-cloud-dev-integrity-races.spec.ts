import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CANONICAL_DEV_PROJECT_REF } from '../../../scripts/assert-cloud-dev-target.mjs'

const expectedScenarios = [
  {
    name: 'completion-first',
    actorAOutcome: { ok: true },
    actorBOutcome: { ok: true },
  },
  {
    name: 'contact-update-first',
    actorAOutcome: { ok: true },
    actorBOutcome: { ok: false, code: 'STAGE01_INTAKE_GATES_NOT_SATISFIED' },
  },
] as const

const roots: string[] = []

async function loadHarness() {
  return import('../../../scripts/run-stage01-cloud-dev-integrity-races.mjs')
    .catch(() => ({}))
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'taskovia-stage01-integrity-races-'))
  roots.push(root)
  mkdirSync(join(root, 'supabase/.temp'), { recursive: true })
  mkdirSync(join(root, 'supabase/tests/database/stage01_integrity_races/completion-first'), { recursive: true })
  mkdirSync(join(root, 'supabase/tests/database/stage01_concurrency'), { recursive: true })
  writeFileSync(join(root, 'supabase/.temp/project-ref'), `${CANONICAL_DEV_PROJECT_REF}\n`)
  writeFileSync(
    join(root, '.env.local'),
    `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co\nNUXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test-key\n`,
  )
  writeFileSync(join(root, '.supabase.dev.env.local'), 'SUPABASE_DEV_ACCESS_TOKEN=dedicated-dev-pat\n')
  writeFileSync(
    join(root, 'supabase/tests/database/stage01_integrity_races/completion-first/actor_a.sql'),
    "-- STAGE01 CLOUD DEV FIXED INTEGRITY RACE FIXTURE\nselect 'actor-a';\n",
  )
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Stage 01 Cloud DEV integrity race harness', () => {
  it('exposes exactly the two approved mixed-command serialization orders', async () => {
    const harness = await loadHarness()
    expect(harness.STAGE01_INTEGRITY_RACE_SCENARIOS).toEqual(expectedScenarios)
  })

  it('sends only fixed integrity SQL and parses only the approved gate outcome', async () => {
    const harness = await loadHarness()
    expect(typeof harness.runStage01IntegrityManagementQuery).toBe('function')
    if (typeof harness.runStage01IntegrityManagementQuery !== 'function') return
    const root = makeRoot()

    await expect(harness.runStage01IntegrityManagementQuery('completion-first', 'actor_a', {
      cwd: root,
      fetchImpl: async () => new Response(JSON.stringify({
        message: 'ERROR: P0001: STAGE01_INTAKE_GATES_NOT_SATISFIED',
        detail: 'sensitive database context',
      }), { status: 400 }),
    })).resolves.toEqual({ ok: false, code: 'STAGE01_INTAKE_GATES_NOT_SATISFIED' })
  })

  it('runs both actors concurrently, verifies database outcomes, then asserts and cleans', async () => {
    const harness = await loadHarness()
    expect(typeof harness.runStage01CloudDevIntegrityRaces).toBe('function')
    if (typeof harness.runStage01CloudDevIntegrityRaces !== 'function') return
    const calls: string[] = []

    await harness.runStage01CloudDevIntegrityRaces({
      scenarios: [expectedScenarios[1]],
      async runOperation(scenario: string, phase: string) {
        calls.push(`${scenario}/${phase}`)
        if (phase === 'actor_a') return { ok: true }
        if (phase === 'actor_b') {
          await Promise.resolve()
          return { ok: false, code: 'STAGE01_INTAKE_GATES_NOT_SATISFIED' }
        }
        return { ok: true }
      },
    })

    expect(calls).toEqual([
      'contact-update-first/cleanup',
      'contact-update-first/setup',
      'contact-update-first/actor_a',
      'contact-update-first/actor_b',
      'contact-update-first/assert',
      'contact-update-first/cleanup',
    ])
  })

  it('rejects an unexpected actor outcome and still performs final cleanup', async () => {
    const harness = await loadHarness()
    expect(typeof harness.runStage01CloudDevIntegrityRaces).toBe('function')
    if (typeof harness.runStage01CloudDevIntegrityRaces !== 'function') return
    const calls: string[] = []

    await expect(harness.runStage01CloudDevIntegrityRaces({
      scenarios: [expectedScenarios[0]],
      async runOperation(scenario: string, phase: string) {
        calls.push(`${scenario}/${phase}`)
        if (phase === 'actor_b') return { ok: false, code: 'STAGE01_INTAKE_GATES_NOT_SATISFIED' }
        return { ok: true }
      },
    })).rejects.toThrow('completion-first returned an unexpected database outcome')
    expect(calls).not.toContain('completion-first/assert')
    expect(calls.at(-1)).toBe('completion-first/cleanup')
  })

  it('uses both real public RPCs and inspects persisted state without synthetic advisory locking', () => {
    for (const scenario of expectedScenarios) {
      const actorSql = ['actor_a', 'actor_b'].map(actor => writeFilePath(scenario.name, actor))
      const combined = actorSql.join('\n')
      expect(combined).toContain('public.complete_stage01_intake')
      expect(combined).toContain('public.update_contact_method')
      expect(combined).not.toMatch(/pg_advisory/iu)

      const assertion = writeFilePath(scenario.name, 'assert')
      expect(assertion).toContain('workflow_node_executions')
      expect(assertion).toContain('contact_methods')
      expect(assertion).toContain('stage01_intake_completion_baselines')
      expect(assertion).toContain('workflow_node_events')
      expect(assertion).toContain('audit_events')
    }
  })
})

function writeFilePath(scenario: string, phase: string) {
  return requireFile(join(
    process.cwd(),
    `supabase/tests/database/stage01_integrity_races/${scenario}/${phase}.sql`,
  ))
}

function requireFile(path: string) {
  return readFileSync(path, 'utf8')
}
