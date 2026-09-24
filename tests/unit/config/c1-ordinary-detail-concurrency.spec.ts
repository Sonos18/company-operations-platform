import { describe, expect, it, vi } from 'vitest'
import { runC1OrdinaryDetailConcurrency, validateC1OrdinaryDetailConcurrencySql } from '../../../scripts/run-c1-ordinary-detail-concurrency.mjs'

const phaseSql = (phase: string) => `-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\n-- ${phase}\nselect 'c1f10000-0000-4000-8000-000000000010'::uuid;`

describe('C1 ordinary-detail concurrency runner', () => {
  it('rejects non-synthetic or unsafe fixture SQL', () => {
    expect(() => validateC1OrdinaryDetailConcurrencySql('actor_a', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\nselect \'10000000-0000-4000-8000-000000000010\';')).toThrow('reserved synthetic')
    expect(() => validateC1OrdinaryDetailConcurrencySql('cleanup', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\ndelete from public.project_cost_items;')).toThrow('broad delete')
    expect(() => validateC1OrdinaryDetailConcurrencySql('cleanup', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\ndelete from public.tenants where id = \'c1f10000-0000-4000-8000-000000000010\';')).toThrow('exact auth user')
    expect(() => validateC1OrdinaryDetailConcurrencySql('actor_a', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\nupdate public.project_cost_items set amount = 0;')).toThrow('broad update')
    expect(() => validateC1OrdinaryDetailConcurrencySql('actor_a', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\nselect private.c1_resolve_or_create_ordinary_project_cost_item(\'c1f10000-0000-4000-8000-000000000010\',\'c1f10000-0000-4000-8000-000000000020\',\'c1f10000-0000-4000-8000-000000000102\',\'c1f10000-0000-4000-8000-000000000301\',\'c1f10000-0000-4000-8000-000000000903\',\'c1f10000-0000-4000-8000-000000000711\');')).toThrow('transaction-held')
    expect(() => validateC1OrdinaryDetailConcurrencySql('actor_b', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\nselect private.c1_resolve_or_create_ordinary_project_cost_item(\'c1f10000-0000-4000-8000-000000000010\',\'c1f10000-0000-4000-8000-000000000020\',\'c1f10000-0000-4000-8000-000000000102\',\'c1f10000-0000-4000-8000-000000000301\',\'c1f10000-0000-4000-8000-000000000903\',\'c1f10000-0000-4000-8000-000000000712\');')).toThrow('readiness barrier')
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
})
