import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CANONICAL_DEV_PROJECT_REF } from '../../../scripts/assert-cloud-dev-target.mjs'
import {
  STAGE01_CONCURRENCY_SCENARIOS,
  runStage01CloudDevConcurrency,
  runStage01ManagementQuery,
} from '../../../scripts/run-stage01-cloud-dev-concurrency.mjs'

const expectedScenarios = [
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
] as const

const roots: string[] = []

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'taskovia-stage01-concurrency-'))
  roots.push(root)
  mkdirSync(join(root, 'supabase/.temp'), { recursive: true })
  mkdirSync(join(root, 'supabase/tests/database/stage01_concurrency/opportunity-update'), { recursive: true })
  writeFileSync(join(root, 'supabase/.temp/project-ref'), `${CANONICAL_DEV_PROJECT_REF}\n`)
  writeFileSync(
    join(root, '.env.local'),
    `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co\nNUXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test-key\n`,
  )
  writeFileSync(join(root, '.supabase.dev.env.local'), 'SUPABASE_DEV_ACCESS_TOKEN=dedicated-dev-pat\n')
  writeFileSync(
    join(root, 'supabase/tests/database/stage01_concurrency/opportunity-update/actor_a.sql'),
    "-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE\nselect 'actor-a';\n",
  )
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Stage 01 Cloud DEV concurrency harness', () => {
  it('exposes exactly the approved nine-scenario public-RPC inventory', () => {
    expect(STAGE01_CONCURRENCY_SCENARIOS).toEqual(expectedScenarios)
  })

  it('sends only fixed SQL through the canonical Management API and dedicated DEV PAT', async () => {
    const root = makeRoot()
    let requestUrl = ''
    let requestInit: RequestInit | undefined

    await expect(runStage01ManagementQuery('opportunity-update', 'actor_a', {
      cwd: root,
      async fetchImpl(url, init) {
        requestUrl = String(url)
        requestInit = init
        return new Response(JSON.stringify([{ actor: 'a' }]), { status: 201 })
      },
    })).resolves.toEqual({ ok: true })

    expect(requestUrl).toBe(`https://api.supabase.com/v1/projects/${CANONICAL_DEV_PROJECT_REF}/database/query`)
    expect(requestInit?.method).toBe('POST')
    expect(requestInit?.headers).toEqual({
      Authorization: 'Bearer dedicated-dev-pat',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      query: "-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE\nselect 'actor-a';",
      read_only: false,
    })
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal)
  })

  it('parses only an exact database VERSION_CONFLICT into a sanitized actor outcome', async () => {
    const root = makeRoot()

    await expect(runStage01ManagementQuery('opportunity-update', 'actor_a', {
      cwd: root,
      fetchImpl: async () => new Response(JSON.stringify({
        message: 'Failed to run sql query: ERROR: P0001: VERSION_CONFLICT',
        database_hint: 'sensitive aggregate details',
      }), { status: 400 }),
    })).resolves.toEqual({ ok: false, code: 'VERSION_CONFLICT' })
  })

  it.each([
    ['another database error', JSON.stringify({ message: 'permission denied: sensitive row' })],
    ['a conflict token outside the database message', JSON.stringify({
      message: 'permission denied: sensitive row',
      hint: 'VERSION_CONFLICT',
    })],
    ['malformed response', 'VERSION_CONFLICT sensitive malformed body'],
  ])('fails closed for %s without exposing response content', async (_label, responseBody) => {
    const root = makeRoot()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    let failure: unknown
    try {
      await runStage01ManagementQuery('opportunity-update', 'actor_a', {
        cwd: root,
        fetchImpl: async () => new Response(responseBody, { status: 500 }),
      })
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('Management API opportunity-update/actor_a failed with status 500')
    expect((failure as Error).message).not.toContain('sensitive')
    expect(consoleSpy.mock.calls.flat().join(' ')).not.toContain('sensitive')
  })

  it('sanitizes network failures without exposing tokens or transport details', async () => {
    const root = makeRoot()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(runStage01ManagementQuery('opportunity-update', 'actor_a', {
      cwd: root,
      fetchImpl: async () => {
        throw new Error('dedicated-dev-pat sensitive socket detail')
      },
    })).rejects.toThrow('Management API opportunity-update/actor_a transport failed')
    expect(consoleSpy.mock.calls.flat().join(' ')).not.toContain('dedicated-dev-pat')
  })

  it('starts both actors before awaiting, accepts one success plus one parsed conflict, then asserts', async () => {
    const calls: string[] = []
    let releaseActors: (() => void) | undefined
    const bothActorsStarted = new Promise<void>(resolve => { releaseActors = resolve })
    let actorStarts = 0

    await runStage01CloudDevConcurrency({
      scenarios: [expectedScenarios[0]],
      async runOperation(scenario, phase) {
        calls.push(`${scenario}/${phase}`)
        if (phase === 'actor_a' || phase === 'actor_b') {
          actorStarts += 1
          if (actorStarts === 2) releaseActors?.()
          await bothActorsStarted
          return phase === 'actor_a' ? { ok: true } : { ok: false, code: 'VERSION_CONFLICT' }
        }
        return { ok: true }
      },
    })

    expect(calls).toEqual([
      'opportunity-update/cleanup',
      'opportunity-update/setup',
      'opportunity-update/actor_a',
      'opportunity-update/actor_b',
      'opportunity-update/assert',
      'opportunity-update/cleanup',
    ])
  })

  it.each([
    ['two successes', { ok: true }, { ok: true }],
    ['two conflicts', { ok: false, code: 'VERSION_CONFLICT' }, { ok: false, code: 'VERSION_CONFLICT' }],
  ] as const)('rejects %s and does not run the final-state assertion', async (_label, actorA, actorB) => {
    const calls: string[] = []

    await expect(runStage01CloudDevConcurrency({
      scenarios: [expectedScenarios[0]],
      async runOperation(scenario, phase) {
        calls.push(`${scenario}/${phase}`)
        if (phase === 'actor_a') return actorA
        if (phase === 'actor_b') return actorB
        return { ok: true }
      },
    })).rejects.toThrow('opportunity-update requires exactly one success and one VERSION_CONFLICT')
    expect(calls).not.toContain('opportunity-update/assert')
    expect(calls.at(-1)).toBe('opportunity-update/cleanup')
  })

  it('rejects a network or unexpected actor failure, skips assertion, and still cleans', async () => {
    const calls: string[] = []

    await expect(runStage01CloudDevConcurrency({
      scenarios: [expectedScenarios[0]],
      async runOperation(scenario, phase) {
        calls.push(`${scenario}/${phase}`)
        if (phase === 'actor_b') throw new Error('sanitized transport failure')
        return { ok: true }
      },
    })).rejects.toThrow('opportunity-update race did not return two database outcomes')
    expect(calls).not.toContain('opportunity-update/assert')
    expect(calls.at(-1)).toBe('opportunity-update/cleanup')
  })

  it('runs final cleanup after setup failure and lets cleanup failure take precedence', async () => {
    let cleanupCalls = 0

    await expect(runStage01CloudDevConcurrency({
      scenarios: [expectedScenarios[0]],
      async runOperation(_scenario, phase) {
        if (phase === 'cleanup') {
          cleanupCalls += 1
          if (cleanupCalls === 2) throw new Error('cleanup residue remains')
        }
        if (phase === 'setup') throw new Error('setup failed')
        return { ok: true }
      },
    })).rejects.toThrow('cleanup residue remains')
    expect(cleanupCalls).toBe(2)
  })

  it('contains the exact RPC and version contract in every fixed actor, with no synthetic locks', () => {
    for (const scenario of expectedScenarios) {
      for (const actor of ['actor_a', 'actor_b']) {
        const sql = readFileSync(
          join(process.cwd(), `supabase/tests/database/stage01_concurrency/${scenario.name}/${actor}.sql`),
          'utf8',
        )
        expect(sql).toContain('-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE')
        expect(sql).toMatch(/\bbegin\s*;/iu)
        expect(sql).toMatch(/set_config\s*\(\s*'request\.jwt\.claims'/iu)
        expect(sql).toContain(scenario.rpc)
        for (const versionKey of scenario.versionKeys) expect(sql).toContain(versionKey)
        expect(sql).toMatch(/\bcommit\s*;/iu)
        expect(sql).not.toMatch(/pg_advisory|pg_sleep/iu)
      }
    }

    for (const obsolete of ['setup', 'actor_a', 'actor_b', 'assert', 'cleanup']) {
      expect(() => readFileSync(
        join(process.cwd(), `supabase/tests/database/stage01_concurrency_${obsolete}.sql`),
        'utf8',
      )).toThrow()
    }
  })
})
