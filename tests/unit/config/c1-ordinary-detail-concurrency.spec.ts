import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { CANONICAL_DEV_PROJECT_REF } from '../../../scripts/assert-cloud-dev-target.mjs'
import { C1_ORDINARY_DETAIL_CONCURRENCY_SCENARIOS, runC1OrdinaryDetailConcurrency, runC1OrdinaryDetailManagementQuery, validateC1OrdinaryDetailConcurrencySql } from '../../../scripts/run-c1-ordinary-detail-concurrency.mjs'

const phaseSql = (phase: string) => `-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\n-- ${phase}\nselect 'c1f10000-0000-4000-8000-000000000010'::uuid;`
const exactCleanupSql = readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1_ordinary_detail_concurrency/cleanup.sql'), 'utf8').replace(/\r\n?/g, '\n').trim()
const runnerSource = readFileSync(resolve(process.cwd(), 'scripts/run-c1-ordinary-detail-concurrency.mjs'), 'utf8')
const runnerCleanupSql = runnerSource.match(/const exactCleanupSql = `([\s\S]*?)`/u)?.[1].replace(/\r\n?/g, '\n').trim()
const managementRoots: string[] = []

function makeManagementRoot() {
  const root = mkdtempSync(join(tmpdir(), 'taskovia-c1-concurrency-'))
  managementRoots.push(root)
  mkdirSync(join(root, 'supabase/.temp'), { recursive: true })
  writeFileSync(join(root, 'supabase/.temp/project-ref'), `${CANONICAL_DEV_PROJECT_REF}\n`)
  writeFileSync(join(root, '.env.local'), `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co\nNUXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test-key\n`)
  writeFileSync(join(root, '.supabase.dev.env.local'), 'SUPABASE_DEV_ACCESS_TOKEN=dedicated-dev-pat\n')
  return root
}

afterEach(() => {
  for (const root of managementRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('C1 ordinary-detail concurrency runner', () => {
  it('covers the approved resolver and legacy parent identity race outcomes', () => {
    expect(C1_ORDINARY_DETAIL_CONCURRENCY_SCENARIOS).toEqual([
      { name: 'resolver-resolver', outcome: 'same-parent' },
      { name: 'direct-direct', outcome: 'same-parent' },
      { name: 'descriptive-correction-resolver', outcome: 'same-parent' },
      { name: 'legacy-create-legacy-create', outcome: 'actor-b-category-conflict' },
      { name: 'legacy-create-resolver', outcome: 'actor-b-category-conflict' },
      { name: 'legacy-recateg-resolver', outcome: 'actor-b-category-conflict' },
    ])
  })

  it('normalizes only the exact category conflict from a real management API error envelope', async () => {
    const cwd = makeManagementRoot()
    await expect(runC1OrdinaryDetailManagementQuery('actor_b', phaseSql('actor_b'), {
      cwd,
      fetchImpl: async () => new Response(JSON.stringify({ message: 'Failed to run sql query: ERROR: P0001: PROJECT_COST_CATEGORY_CONFLICT' }), { status: 400 }),
    })).resolves.toEqual({ errorCode: 'PROJECT_COST_CATEGORY_CONFLICT' })

    for (const body of [
      { message: 'Failed to run sql query: ERROR: PROJECT_COST_CATEGORY_CONFLICT' },
      { message: 'Failed to run sql query: ERROR: XP0001: PROJECT_COST_CATEGORY_CONFLICT' },
      { message: 'Failed to run sql query: ERROR: P0001: PROJECT_COST_CATEGORY_CONFLICT_EXTRA' },
      { message: 'Failed to run sql query: ERROR: P0001: VERSION_CONFLICT', hint: 'PROJECT_COST_CATEGORY_CONFLICT' },
    ]) {
      await expect(runC1OrdinaryDetailManagementQuery('actor_b', phaseSql('actor_b'), {
        cwd,
        fetchImpl: async () => new Response(JSON.stringify(body), { status: 400 }),
      })).rejects.toThrow('C1 ordinary-detail concurrency actor_b failed')
    }
    await expect(runC1OrdinaryDetailManagementQuery('actor_b', phaseSql('actor_b'), {
      cwd,
      fetchImpl: async () => new Response('malformed management response', { status: 400 }),
    })).rejects.toThrow('C1 ordinary-detail concurrency actor_b failed')
    await expect(runC1OrdinaryDetailManagementQuery('actor_a', phaseSql('actor_a'), {
      cwd,
      fetchImpl: async () => new Response(JSON.stringify({ message: 'Failed to run sql query: ERROR: 42501: permission denied for schema private\nCONTEXT: PL/pgSQL function private.example() line 4 at SQL statement' }), { status: 400 }),
    })).rejects.toThrow('C1 ordinary-detail concurrency actor_a failed with status 400 (42501: permission denied for schema private) at PL/pgSQL function private.example() line 4 at SQL statement')
  })

  it('accepts one successful parent and the stable category-conflict loser for a legacy race', async () => {
    const calls: string[] = []
    await expect(runC1OrdinaryDetailConcurrency({
      scenarios: [{ name: 'legacy-create-resolver', outcome: 'actor-b-category-conflict' }],
      assertTarget: vi.fn(), readPhase: phaseSql,
      runPhase: async phase => {
        calls.push(phase)
        if (phase === 'actor_a') return { parentId: 'c1f10000-0000-4000-8000-000000000201' }
        if (phase === 'actor_b') return { errorCode: 'PROJECT_COST_CATEGORY_CONFLICT' }
        if (phase === 'assert') return { parentCount: 1 }
        return {}
      },
    })).resolves.toBeUndefined()
    expect(calls).toEqual(['cleanup', 'setup', 'actor_a', 'actor_b', 'assert', 'cleanup'])
  })

  it('rejects non-synthetic or unsafe fixture SQL', () => {
    expect(() => validateC1OrdinaryDetailConcurrencySql('actor_a', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\nselect \'10000000-0000-4000-8000-000000000010\';')).toThrow('reserved synthetic')
    expect(() => validateC1OrdinaryDetailConcurrencySql('cleanup', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\ndelete from public.project_cost_items;')).toThrow('broad delete')
    expect(() => validateC1OrdinaryDetailConcurrencySql('cleanup', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\ndelete from public.tenants where id = \'c1f10000-0000-4000-8000-000000000010\';')).toThrow('exact auth user')
    expect(() => validateC1OrdinaryDetailConcurrencySql('actor_a', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\nupdate public.project_cost_items set amount = 0;')).toThrow('broad update')
    expect(() => validateC1OrdinaryDetailConcurrencySql('actor_a', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\nselect private.c1_resolve_or_create_ordinary_project_cost_item(\'c1f10000-0000-4000-8000-000000000010\',\'c1f10000-0000-4000-8000-000000000020\',\'c1f10000-0000-4000-8000-000000000102\',\'c1f10000-0000-4000-8000-000000000301\',\'c1f10000-0000-4000-8000-000000000903\',\'c1f10000-0000-4000-8000-000000000711\');')).toThrow('transaction-held')
    expect(() => validateC1OrdinaryDetailConcurrencySql('actor_b', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\nselect private.c1_resolve_or_create_ordinary_project_cost_item(\'c1f10000-0000-4000-8000-000000000010\',\'c1f10000-0000-4000-8000-000000000020\',\'c1f10000-0000-4000-8000-000000000102\',\'c1f10000-0000-4000-8000-000000000301\',\'c1f10000-0000-4000-8000-000000000903\',\'c1f10000-0000-4000-8000-000000000712\');')).toThrow('readiness barrier')
    expect(() => validateC1OrdinaryDetailConcurrencySql('cleanup', `${exactCleanupSql}\ndelete from public.tenants where true;`)).toThrow('only exact approved cleanup DELETE')
    expect(() => validateC1OrdinaryDetailConcurrencySql('cleanup', `${exactCleanupSql}\ndelete from public.project_cost_items where id = 'c1f10000-0000-4000-8000-000000000201';`)).toThrow('only exact approved cleanup DELETE')
    expect(() => validateC1OrdinaryDetailConcurrencySql('cleanup', `${exactCleanupSql}\ndelete from public.tenants where id = 'c1f10000-0000-4000-8000-000000000011';`)).toThrow('only exact approved cleanup DELETE')
    expect(() => validateC1OrdinaryDetailConcurrencySql('actor_a', `-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\nbegin;\nselect private.c1_resolve_or_create_ordinary_project_cost_item();\nselect pg_catalog.pg_sleep(1);\ncommit;\nupdate public.project_cost_items set amount = 0 where id = 'c1f10000-0000-4000-8000-000000000201';`)).toThrow('broad update')
  })

  it('uses the exact cleanup to cover every populated synthetic fixture table', () => {
    for (const table of [
      'public.project_cost_items', 'public.cost_command_receipts', 'public.cost_categories', 'public.projects',
      'public.company_cost_settings', 'public.company_role_assignments', 'public.role_permissions', 'public.roles',
      'public.company_memberships', 'public.tenant_memberships', 'public.audit_events', 'public.companies',
      'public.tenants', 'auth.users',
    ]) expect(exactCleanupSql).toContain(`delete from ${table}`)
    expect(exactCleanupSql).toContain("command_name in ('project_cost_draft.create','project_cost.correct','project_cost_detail.create_and_publish')")
  })

  it('removes managed detail history before asserting it is gone and deleting fixture parents', () => {
    expect(runnerCleanupSql).toBe(exactCleanupSql)
    for (const fragment of [
      "command_name = 'cost_evidence.detail_link'",
      "command_name like 'project_cost_detail.%'",
      "action like 'c1.project_cost_detail.%'",
      'delete from public.cost_evidence_links',
      'delete from public.project_cost_item_detail_sources',
      'private.c1_project_cost_item_has_managed_detail_state',
    ]) expect(exactCleanupSql).toContain(fragment)

    const receipt = exactCleanupSql.indexOf("command_name = 'cost_evidence.detail_link'")
    const audit = exactCleanupSql.indexOf("action like 'c1.project_cost_detail.%'")
    const evidence = exactCleanupSql.indexOf('delete from public.cost_evidence_links')
    const source = exactCleanupSql.indexOf('delete from public.project_cost_item_detail_sources')
    const assertion = exactCleanupSql.indexOf('private.c1_project_cost_item_has_managed_detail_state')
    const parent = exactCleanupSql.indexOf('delete from public.project_cost_items')
    expect(receipt).toBeGreaterThan(-1)
    expect(receipt).toBeLessThan(audit)
    expect(audit).toBeLessThan(evidence)
    expect(evidence).toBeLessThan(source)
    expect(source).toBeLessThan(assertion)
    expect(assertion).toBeLessThan(parent)
  })

  it('requires the descriptive correction race to prove both lock directions before either command runs', () => {
    const fixtureRoot = resolve(process.cwd(), 'supabase/tests/database/c1_ordinary_detail_concurrency/descriptive-correction-resolver')
    const actorA = readFileSync(resolve(fixtureRoot, 'actor_a.sql'), 'utf8')
    const actorB = readFileSync(resolve(fixtureRoot, 'actor_b.sql'), 'utf8')

    expect(actorA).toMatch(/for update[\s\S]*c1_descriptive_parent_row_ready[\s\S]*pg_try_advisory_lock[\s\S]*c1_project_cost_category:[\s\S]*c1_correct_published_project_cost/iu)
    expect(actorB).toMatch(/pg_try_advisory_lock[\s\S]*c1_descriptive_parent_row_ready[\s\S]*pg_advisory_xact_lock[\s\S]*c1_project_cost_category:[\s\S]*pg_sleep\(3\)[\s\S]*c1_resolve_or_create_ordinary_project_cost_item/iu)
    expect(actorA).toContain('category-lock readiness barrier timed out')
    expect(actorB).toContain('parent-row readiness barrier timed out')
  })

  it('guards the target, launches exactly two sessions, asserts one parent, and always performs exact cleanup', async () => {
    const assertTarget = vi.fn()
    const calls: string[] = []
    const run = vi.fn(async (phase: string) => {
      calls.push(phase)
      if (phase === 'actor_a') return { parentId: 'c1f10000-0000-4000-8000-000000000201' }
      if (phase === 'actor_b') return { parentId: 'c1f10000-0000-4000-8000-000000000201' }
      if (phase === 'assert') return { parentCount: 1 }
      return {}
    })

    await runC1OrdinaryDetailConcurrency({ scenarios: [C1_ORDINARY_DETAIL_CONCURRENCY_SCENARIOS[0]], assertTarget, readPhase: phaseSql, runPhase: run })

    expect(assertTarget).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['cleanup', 'setup', 'actor_a', 'actor_b', 'assert', 'cleanup'])
    expect(run).toHaveBeenCalledTimes(6)
  })

  it.each(['setup', 'actor_a', 'assert'])('cleans up after a %s failure', async failedPhase => {
    const calls: string[] = []
    await expect(runC1OrdinaryDetailConcurrency({
      scenarios: [C1_ORDINARY_DETAIL_CONCURRENCY_SCENARIOS[0]], assertTarget: vi.fn(), readPhase: phaseSql,
      runPhase: async phase => {
        calls.push(phase)
        if (phase === failedPhase) throw new Error(`${phase} failed`)
        if (phase === 'actor_a' || phase === 'actor_b') return { parentId: 'c1f10000-0000-4000-8000-000000000201' }
        if (phase === 'assert') return { parentCount: 1 }
        return {}
      },
    })).rejects.toThrow(`${failedPhase} failed`)
    expect(calls.at(-1)).toBe('cleanup')
  })

  it('accepts only the checked deterministic fixture files', async () => {
    const calls: string[] = []
    await runC1OrdinaryDetailConcurrency({
      scenarios: [C1_ORDINARY_DETAIL_CONCURRENCY_SCENARIOS[0]], assertTarget: vi.fn(),
      runPhase: async phase => {
        calls.push(phase)
        if (phase === 'actor_a' || phase === 'actor_b') return { parentId: 'c1f10000-0000-4000-8000-000000000201' }
        if (phase === 'assert') return { parentCount: 1 }
        return {}
      },
    })
    expect(calls).toEqual(['cleanup', 'setup', 'actor_a', 'actor_b', 'assert', 'cleanup'])
  })

  it('loads and checks every approved real fixture scenario', async () => {
    const calls: string[] = []
    const setups = new Map<string, string>()
    await runC1OrdinaryDetailConcurrency({
      assertTarget: vi.fn(),
      runPhase: async (phase, sql, scenario) => {
        calls.push(`${scenario.name}:${phase}`)
        if (phase === 'setup') setups.set(scenario.name, sql)
        if (phase === 'actor_a') return { parentId: 'c1f10000-0000-4000-8000-000000000201' }
        if (phase === 'actor_b') return scenario.outcome === 'same-parent'
          ? { parentId: 'c1f10000-0000-4000-8000-000000000201' }
          : { errorCode: 'PROJECT_COST_CATEGORY_CONFLICT' }
        if (phase === 'assert') return scenario.name === 'direct-direct'
          ? { parentCount: 1, detailCount: 2, publishedCount: 2, distinctLineCount: 2, amountText: '3.0000', directReceiptCount: 2, directAuditCount: 2 }
          : { parentCount: 1 }
        return {}
      },
    })
    expect(calls).toHaveLength(C1_ORDINARY_DETAIL_CONCURRENCY_SCENARIOS.length * 6)
    expect(setups.get('descriptive-correction-resolver')).toContain("'cost.correct'")
    expect(setups.get('legacy-recateg-resolver')).toContain('legacy recategorization source')
    expect(setups.get('resolver-resolver')).not.toContain("'cost.correct'")
  })

  it('fails closed when actor parent IDs differ while still cleaning up', async () => {
    const calls: string[] = []
    await expect(runC1OrdinaryDetailConcurrency({
      scenarios: [C1_ORDINARY_DETAIL_CONCURRENCY_SCENARIOS[0]], assertTarget: vi.fn(), readPhase: phaseSql,
      runPhase: async phase => {
        calls.push(phase)
        if (phase === 'actor_a') return { parentId: 'c1f10000-0000-4000-8000-000000000201' }
        if (phase === 'actor_b') return { parentId: 'c1f10000-0000-4000-8000-000000000202' }
        if (phase === 'assert') return { parentCount: 1 }
        return {}
      },
    })).rejects.toThrow('same parent ID')
    expect(calls.at(-1)).toBe('cleanup')
  })

  it('waits for both rejected actors before cleanup and retains both failures', async () => {
    let actorASettled = false
    let actorBSettled = false
    let cleanupAfterActors = false
    let cleanupCalls = 0
    let rejectActorA!: (reason: Error) => void
    let rejectActorB!: (reason: Error) => void
    let startActorA!: () => void
    let startActorB!: () => void
    const actorAStarted = new Promise<void>(resolve => { startActorA = resolve })
    const actorBStarted = new Promise<void>(resolve => { startActorB = resolve })
    const actorAFailure = new Error('actor A failed')
    const actorBFailure = new Error('actor B failed')

    const execution = runC1OrdinaryDetailConcurrency({
      scenarios: [C1_ORDINARY_DETAIL_CONCURRENCY_SCENARIOS[0]], assertTarget: vi.fn(), readPhase: phaseSql,
      runPhase: phase => {
        if (phase === 'cleanup') {
          cleanupCalls += 1
          if (cleanupCalls === 2) cleanupAfterActors = actorASettled && actorBSettled
          return Promise.resolve({})
        }
        if (phase === 'actor_a') return new Promise((_resolve, reject) => {
          startActorA()
          rejectActorA = reason => { actorASettled = true; reject(reason) }
        })
        if (phase === 'actor_b') return new Promise((_resolve, reject) => {
          startActorB()
          rejectActorB = reason => { actorBSettled = true; reject(reason) }
        })
        return Promise.resolve({})
      },
    })

    await Promise.all([actorAStarted, actorBStarted])
    rejectActorA(actorAFailure)
    await Promise.resolve()
    expect(cleanupCalls).toBe(1)

    rejectActorB(actorBFailure)
    const failure = await execution.catch(error => error)

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([actorAFailure, actorBFailure])
    expect(cleanupAfterActors).toBe(true)
  })
})
