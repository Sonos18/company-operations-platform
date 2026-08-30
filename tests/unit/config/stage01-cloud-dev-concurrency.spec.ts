import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CANONICAL_DEV_PROJECT_REF } from '../../../scripts/assert-cloud-dev-target.mjs'
import {
  runStage01CloudDevConcurrency,
  runStage01ManagementQuery,
} from '../../../scripts/run-stage01-cloud-dev-concurrency.mjs'

const worktrees: string[] = []

function makeWorktree() {
  const root = mkdtempSync(join(tmpdir(), 'taskovia-stage01-concurrency-'))
  worktrees.push(root)
  mkdirSync(join(root, 'supabase/.temp'), { recursive: true })
  mkdirSync(join(root, 'supabase/tests/database'), { recursive: true })
  writeFileSync(join(root, 'supabase/.temp/project-ref'), `${CANONICAL_DEV_PROJECT_REF}\n`)
  writeFileSync(
    join(root, '.env.local'),
    `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co\nNUXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test-key\n`,
  )
  writeFileSync(join(root, '.supabase.dev.env.local'), 'SUPABASE_DEV_ACCESS_TOKEN=dedicated-dev-pat\n')
  writeFileSync(
    join(root, 'supabase/tests/database/stage01_concurrency_actor_a.sql'),
    "-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE\nselect 'actor-a';\n",
  )
  return root
}

afterEach(() => {
  for (const root of worktrees.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Stage 01 Cloud DEV concurrency harness', () => {
  it('runs each fixed actor through the canonical Management API with the dedicated DEV PAT', async () => {
    const root = makeWorktree()
    let requestUrl = ''
    let requestInit: RequestInit | undefined

    await runStage01ManagementQuery('stage01-concurrency-actor-a', {
      cwd: root,
      async fetchImpl(url, init) {
        requestUrl = String(url)
        requestInit = init
        return new Response(JSON.stringify({ result: [{ actor: 'a' }] }), { status: 201 })
      },
    })

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

  it('rejects a failed Management API query without exposing its response body', async () => {
    const root = makeWorktree()

    await expect(runStage01ManagementQuery('stage01-concurrency-actor-a', {
      cwd: root,
      fetchImpl: async () => new Response('sensitive database response', { status: 500 }),
    })).rejects.toThrow('Management API stage01-concurrency-actor-a failed with status 500')
  })

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
