import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CANONICAL_DEV_PROJECT_REF, assertCloudDevTarget } from '../../../scripts/assert-cloud-dev-target.mjs'
import { resolveSupabaseDevHome, runSupabaseDevCli } from '../../../scripts/run-supabase-dev.mjs'

const worktrees: string[] = []

function makeWorktree(options: { projectRef?: string, url?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vqh-cloud-dev-target-'))
  worktrees.push(root)
  mkdirSync(join(root, 'supabase/.temp'), { recursive: true })

  if (options.projectRef !== undefined) {
    writeFileSync(join(root, 'supabase/.temp/project-ref'), `${options.projectRef}\n`)
  }

  if (options.url !== undefined) {
    writeFileSync(join(root, '.env.local'), `NUXT_PUBLIC_SUPABASE_URL=${options.url}\nNUXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key\n`)
  }

  return root
}

afterEach(() => {
  for (const root of worktrees.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Cloud DEV target guard', () => {
  it('runs the target guard before every linked DEV command', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))

    expect(packageJson.scripts['db:dev:target']).toBe('node scripts/assert-cloud-dev-target.mjs')
    expect(packageJson.scripts['db:dev:login']).toBe('node scripts/run-supabase-dev.mjs login --agent no')
    expect(packageJson.scripts['db:dev:status']).toBe('pnpm db:dev:target && node scripts/run-supabase-dev.mjs migration list --linked')
    expect(packageJson.scripts['db:dev:dry-run']).toBe('pnpm db:dev:target && node scripts/run-supabase-dev.mjs db push --linked --dry-run')
    expect(packageJson.scripts['db:dev:push']).toBe('pnpm db:dev:target && node scripts/run-supabase-dev.mjs db push --linked')
    expect(packageJson.scripts['db:dev:test']).toBe('pnpm db:dev:target && node scripts/run-supabase-dev.mjs test db --linked')
    expect(packageJson.scripts['db:dev:types']).toBe(
      'pnpm db:dev:target && node scripts/run-supabase-dev.mjs gen types typescript --linked > shared/types/database.types.ts',
    )
  })

  it('uses an isolated stable CLI home instead of the default Supabase auth home', () => {
    const defaultAuthHome = 'C:\\Users\\developer\\AppData\\Roaming\\Supabase'
    const env = { LOCALAPPDATA: 'C:\\Users\\developer\\AppData\\Local', SUPABASE_HOME: defaultAuthHome }
    const isolatedHome = resolveSupabaseDevHome({ env, platform: 'win32' })
    let childEnvironment: NodeJS.ProcessEnv | undefined

    runSupabaseDevCli(['projects', 'list'], {
      env,
      platform: 'win32',
      spawn(command, args, options) {
        childEnvironment = options.env
        expect(command).toBe(process.execPath)
        expect(args).toEqual([resolve(process.cwd(), 'node_modules/supabase/dist/supabase.js'), 'projects', 'list'])
        return { status: 0 }
      },
    })

    expect(isolatedHome).toBe('C:\\Users\\developer\\AppData\\Local\\SupabaseCLI\\company-operations-dev')
    expect(childEnvironment?.SUPABASE_HOME).toBe(isolatedHome)
    expect(childEnvironment?.SUPABASE_HOME).not.toBe(defaultAuthHome)
  })

  it('accepts only the canonical linked project and matching Cloud DEV URL', () => {
    const root = makeWorktree({
      projectRef: CANONICAL_DEV_PROJECT_REF,
      url: `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
    })

    expect(() => assertCloudDevTarget({ cwd: root })).not.toThrow()
  })

  it('fails closed when the Supabase CLI link state is missing', () => {
    const root = makeWorktree({ url: `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co` })

    expect(() => assertCloudDevTarget({ cwd: root })).toThrow('Supabase CLI link state is missing')
  })

  it('preserves the filesystem cause when link state is missing', () => {
    const root = makeWorktree({ url: `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co` })

    try {
      assertCloudDevTarget({ cwd: root })
      throw new Error('expected the target guard to fail')
    } catch (error) {
      expect(error).toMatchObject({ message: 'Supabase CLI link state is missing' })
      expect((error as Error & { cause?: NodeJS.ErrnoException }).cause?.code).toBe('ENOENT')
    }
  })

  it('fails closed when the linked project differs from the canonical DEV target', () => {
    const root = makeWorktree({
      projectRef: 'wrongprojectref',
      url: `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
    })

    expect(() => assertCloudDevTarget({ cwd: root })).toThrow('Linked project ref does not match canonical Cloud DEV target')
  })

  it('fails closed when the local Supabase URL points to another project', () => {
    const root = makeWorktree({
      projectRef: CANONICAL_DEV_PROJECT_REF,
      url: 'https://wrongprojectref.supabase.co',
    })

    expect(() => assertCloudDevTarget({ cwd: root })).toThrow('NUXT_PUBLIC_SUPABASE_URL does not match canonical Cloud DEV target')
  })
})
