import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CANONICAL_DEV_PROJECT_REF } from '../../../scripts/assert-cloud-dev-target.mjs'
import { runSupabaseDevMode } from '../../../scripts/run-supabase-dev.mjs'

const worktrees: string[] = []

function makeWorktree({ linked = true }: { linked?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vqh-cloud-dev-runner-'))
  worktrees.push(root)
  mkdirSync(join(root, 'supabase/.temp'), { recursive: true })
  if (linked) writeFileSync(join(root, 'supabase/.temp/project-ref'), `${CANONICAL_DEV_PROJECT_REF}\n`)
  writeFileSync(
    join(root, '.env.local'),
    `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co\nNUXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test-key\n`,
  )
  writeFileSync(join(root, '.supabase.dev.env.local'), 'SUPABASE_DEV_ACCESS_TOKEN=dedicated-dev-pat\n')
  return root
}

afterEach(() => {
  for (const root of worktrees.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Cloud DEV fixed-mode runner', () => {
  it('maps only the dedicated DEV PAT to the guarded child environment', () => {
    const root = makeWorktree()
    let childEnvironment: NodeJS.ProcessEnv | undefined
    let childArgs: string[] | undefined

    runSupabaseDevMode('status', {
      cwd: root,
      env: {
        LOCALAPPDATA: 'C:\\Users\\developer\\AppData\\Local',
        SUPABASE_ACCESS_TOKEN: 'ambient-token',
        SUPABASE_CLI_BINARY_OVERRIDE: 'untrusted-supabase-binary.exe',
        SUPABASE_DB_PASSWORD: 'ambient-password',
      },
      spawn(_command, args, options) {
        childArgs = args
        childEnvironment = options.env
        return { status: 0 }
      },
    })

    expect(childArgs?.slice(-3)).toEqual(['migration', 'list', '--linked'])
    expect(childEnvironment?.SUPABASE_HOME).toBe('C:\\Users\\developer\\AppData\\Local\\SupabaseCLI\\company-operations-dev')
    expect(childEnvironment?.SUPABASE_ACCESS_TOKEN).toBe('dedicated-dev-pat')
    expect(childEnvironment).not.toHaveProperty('SUPABASE_CLI_BINARY_OVERRIDE')
    expect(childEnvironment).not.toHaveProperty('SUPABASE_DB_PASSWORD')
    expect(childEnvironment).not.toHaveProperty('SUPABASE_DEV_ACCESS_TOKEN')
  })

  it('fails before spawning when the dedicated DEV PAT file is missing, ambiguous, or empty', () => {
    const root = makeWorktree()
    rmSync(join(root, '.supabase.dev.env.local'))
    let spawnCalls = 0
    const spawn = () => {
      spawnCalls += 1
      return { status: 0 }
    }

    expect(() => runSupabaseDevMode('status', { cwd: root, spawn })).toThrow('Dedicated Supabase DEV PAT file is missing')
    writeFileSync(join(root, '.supabase.dev.env.local'), 'SUPABASE_DEV_ACCESS_TOKEN=first\nSUPABASE_DEV_ACCESS_TOKEN=second\n')
    expect(() => runSupabaseDevMode('status', { cwd: root, spawn })).toThrow('SUPABASE_DEV_ACCESS_TOKEN must be assigned exactly once')
    writeFileSync(join(root, '.supabase.dev.env.local'), 'SUPABASE_DEV_ACCESS_TOKEN=\n')
    expect(() => runSupabaseDevMode('status', { cwd: root, spawn })).toThrow('SUPABASE_DEV_ACCESS_TOKEN is missing or empty')
    expect(spawnCalls).toBe(0)
  })

  it('checks access to the exact DEV ref without printing a project list', () => {
    const root = makeWorktree()
    let childArgs: string[] | undefined

    expect(() => runSupabaseDevMode('auth-check', {
      cwd: root,
      spawn(_command, args) {
        childArgs = args
        return {
          status: 0,
          stdout: JSON.stringify({ message: 'projects available', projects: [{ ref: CANONICAL_DEV_PROJECT_REF }] }),
        }
      },
    })).not.toThrow()

    expect(childArgs?.slice(-4)).toEqual(['projects', 'list', '--output-format', 'json'])
  })

  it('checks PAT visibility before a fresh checkout has link state', () => {
    const root = makeWorktree({ linked: false })

    expect(() => runSupabaseDevMode('auth-check', {
      cwd: root,
      spawn: () => ({
        status: 0,
        stdout: JSON.stringify({ message: 'projects available', projects: [{ ref: CANONICAL_DEV_PROJECT_REF }] }),
      }),
    })).not.toThrow()
  })

  it('links a fresh checkout to the fixed canonical ref and verifies the resulting link state', () => {
    const root = makeWorktree({ linked: false })

    expect(() => runSupabaseDevMode('link', {
      cwd: root,
      spawn(_command, args) {
        expect(args.slice(-3)).toEqual(['link', '--project-ref', CANONICAL_DEV_PROJECT_REF])
        writeFileSync(join(root, 'supabase/.temp/project-ref'), `${CANONICAL_DEV_PROJECT_REF}\n`)
        return { status: 0 }
      },
    })).not.toThrow()
  })

  it('fails closed when a successful link process does not create canonical link state', () => {
    const root = makeWorktree({ linked: false })
    let spawnCalls = 0

    expect(() => runSupabaseDevMode('link', {
      cwd: root,
      spawn() {
        spawnCalls += 1
        return { status: 0 }
      },
    })).toThrow('Supabase CLI link state is missing')
    expect(spawnCalls).toBe(1)
  })

  it('rejects a PAT that cannot see the canonical DEV project before returning', () => {
    const root = makeWorktree()

    expect(() => runSupabaseDevMode('auth-check', {
      cwd: root,
      spawn: () => ({ status: 0, stdout: JSON.stringify({ message: 'projects available', projects: [{ ref: 'other-project-ref' }] }) }),
    })).toThrow('Dedicated Supabase DEV PAT cannot access the canonical project')
  })

  it('rejects malformed or missing CLI project envelopes without exposing them', () => {
    const root = makeWorktree()

    expect(() => runSupabaseDevMode('auth-check', {
      cwd: root,
      spawn: () => ({ status: 0, stdout: JSON.stringify({ message: 'projects available' }) }),
    })).toThrow('Supabase DEV auth check returned invalid project data')
  })

  it('rejects arbitrary and destructive modes before spawning a child', () => {
    let spawnCalls = 0
    const spawn = () => {
      spawnCalls += 1
      return { status: 0 }
    }

    expect(() => runSupabaseDevMode('db reset --linked', { spawn })).toThrow('Unsupported Cloud DEV operation')
    expect(() => runSupabaseDevMode('seed', { spawn })).toThrow('Unsupported Cloud DEV operation')
    expect(spawnCalls).toBe(0)
  })

  it('leaves generated types byte-identical when type generation fails or is implausible', () => {
    const root = makeWorktree()
    const target = join(root, 'shared/types/database.types.ts')
    mkdirSync(join(root, 'shared/types/database.types.ts', '..'), { recursive: true })
    writeFileSync(target, 'existing generated types\n')

    expect(() => runSupabaseDevMode('types', { cwd: root, spawn: () => ({ status: 1, stdout: 'failure' }) })).toThrow()
    expect(readFileSync(target, 'utf8')).toBe('existing generated types\n')
    expect(() => runSupabaseDevMode('types', { cwd: root, spawn: () => ({ status: 0, stdout: 'not types' }) })).toThrow()
    expect(readFileSync(target, 'utf8')).toBe('existing generated types\n')
  })
})
