import { describe, expect, it, vi } from 'vitest'
import { runC1OrdinaryDetailConcurrency, validateC1OrdinaryDetailConcurrencySql } from '../../../scripts/run-c1-ordinary-detail-concurrency.mjs'

const phaseSql = (phase: string) => `-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\n-- ${phase}\nselect 'c1f10000-0000-4000-8000-000000000010'::uuid;`
const exactCleanupSql = `-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE
delete from public.tenants where id = 'c1f10000-0000-4000-8000-000000000010';
delete from auth.users where id = 'c1f10000-0000-4000-8000-000000000903';`

describe('C1 ordinary-detail concurrency runner', () => {
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

    await runC1OrdinaryDetailConcurrency({ assertTarget, readPhase: phaseSql, runPhase: run })

    expect(assertTarget).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['cleanup', 'setup', 'actor_a', 'actor_b', 'assert', 'cleanup'])
    expect(run).toHaveBeenCalledTimes(6)
  })

  it.each(['setup', 'actor_a', 'assert'])('cleans up after a %s failure', async failedPhase => {
    const calls: string[] = []
    await expect(runC1OrdinaryDetailConcurrency({
      assertTarget: vi.fn(), readPhase: phaseSql,
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
      assertTarget: vi.fn(),
      runPhase: async phase => {
        calls.push(phase)
        if (phase === 'actor_a' || phase === 'actor_b') return { parentId: 'c1f10000-0000-4000-8000-000000000201' }
        if (phase === 'assert') return { parentCount: 1 }
        return {}
      },
    })
    expect(calls).toEqual(['cleanup', 'setup', 'actor_a', 'actor_b', 'assert', 'cleanup'])
  })

  it('fails closed when actor parent IDs differ while still cleaning up', async () => {
    const calls: string[] = []
    await expect(runC1OrdinaryDetailConcurrency({
      assertTarget: vi.fn(), readPhase: phaseSql,
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
      assertTarget: vi.fn(), readPhase: phaseSql,
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
