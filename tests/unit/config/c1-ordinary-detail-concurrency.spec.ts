import { describe, expect, it, vi } from 'vitest'
import { runC1OrdinaryDetailConcurrency, validateC1OrdinaryDetailConcurrencySql } from '../../../scripts/run-c1-ordinary-detail-concurrency.mjs'

const phaseSql = (phase: string) => `-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\n-- ${phase}\nselect 'c1f10000-0000-4000-8000-000000000010'::uuid;`

describe('C1 ordinary-detail concurrency runner', () => {
  it('rejects non-synthetic or unsafe fixture SQL', () => {
    expect(() => validateC1OrdinaryDetailConcurrencySql('actor_a', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\nselect \'10000000-0000-4000-8000-000000000010\';')).toThrow('reserved synthetic')
    expect(() => validateC1OrdinaryDetailConcurrencySql('cleanup', '-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE\ndelete from public.project_cost_items;')).toThrow('broad delete')
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
