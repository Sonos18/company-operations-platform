import { describe, expect, it } from 'vitest'
import { runStage01CloudDevConcurrency } from '../../../scripts/run-stage01-cloud-dev-concurrency.mjs'

describe('Stage 01 Cloud DEV concurrency harness', () => {
  it('pre-cleans, accepts exactly one race winner, asserts final state, and cleans in finally', async () => {
    const calls: string[] = []

    await runStage01CloudDevConcurrency({
      async runMode(mode) {
        calls.push(mode)
        if (mode === 'stage01-concurrency-actor-b') throw new Error('VERSION_CONFLICT')
      },
    })

    expect(calls).toEqual([
      'stage01-concurrency-cleanup',
      'stage01-concurrency-setup',
      'stage01-concurrency-actor-a',
      'stage01-concurrency-actor-b',
      'stage01-concurrency-assert',
      'stage01-concurrency-cleanup',
    ])
  })

  it('cleans after setup or assertion failure and preserves the original failure', async () => {
    const calls: string[] = []

    await expect(runStage01CloudDevConcurrency({
      async runMode(mode) {
        calls.push(mode)
        if (mode === 'stage01-concurrency-actor-b') throw new Error('VERSION_CONFLICT')
        if (mode === 'stage01-concurrency-assert') throw new Error('winner assertion failed')
      },
    })).rejects.toThrow('winner assertion failed')
    expect(calls.at(-1)).toBe('stage01-concurrency-cleanup')
  })

  it('fails when both race actors succeed or both fail', async () => {
    await expect(runStage01CloudDevConcurrency({ runMode: async () => {} }))
      .rejects.toThrow('exactly one actor must succeed')

    await expect(runStage01CloudDevConcurrency({
      async runMode(mode) {
        if (mode.includes('actor-')) throw new Error('both lost')
      },
    })).rejects.toThrow('exactly one actor must succeed')
  })

  it('reports cleanup failure even when the race body also failed', async () => {
    let cleanupCalls = 0

    await expect(runStage01CloudDevConcurrency({
      async runMode(mode) {
        if (mode === 'stage01-concurrency-cleanup') {
          cleanupCalls += 1
          if (cleanupCalls === 2) throw new Error('cleanup residue remains')
        }
        if (mode === 'stage01-concurrency-assert') throw new Error('assertion failed')
        if (mode === 'stage01-concurrency-actor-b') throw new Error('VERSION_CONFLICT')
      },
    })).rejects.toThrow('cleanup residue remains')
  })
})
