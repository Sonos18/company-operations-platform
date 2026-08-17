import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CANONICAL_DEV_PROJECT_REF, assertCloudDevTarget } from '../../../scripts/assert-cloud-dev-target.mjs'
import { resolveSupabaseDevHome } from '../../../scripts/run-supabase-dev.mjs'

const worktrees: string[] = []

function makeWorktree(options: { projectRef?: string, envLines?: string[], url?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vqh-cloud-dev-target-'))
  worktrees.push(root)
  mkdirSync(join(root, 'supabase/.temp'), { recursive: true })

  if (options.projectRef !== undefined) {
    writeFileSync(join(root, 'supabase/.temp/project-ref'), `${options.projectRef}\n`)
  }

  if (options.envLines !== undefined) {
    writeFileSync(join(root, '.env.local'), `${options.envLines.join('\n')}\n`)
  } else if (options.url !== undefined) {
    writeFileSync(join(root, '.env.local'), `NUXT_PUBLIC_SUPABASE_URL=${options.url}\nNUXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test-key\n`)
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
    expect(packageJson.scripts).not.toHaveProperty('db:dev:login')
    expect(packageJson.scripts['db:dev:auth-check']).toBe('node scripts/run-supabase-dev.mjs auth-check')
    expect(packageJson.scripts['db:dev:status']).toBe('node scripts/run-supabase-dev.mjs status')
    expect(packageJson.scripts['db:dev:dry-run']).toBe('node scripts/run-supabase-dev.mjs dry-run')
    expect(packageJson.scripts['db:dev:push']).toBe('node scripts/run-supabase-dev.mjs push')
    expect(packageJson.scripts['db:dev:test']).toBe('node scripts/run-supabase-dev.mjs pg-tap')
    expect(packageJson.scripts['db:dev:types']).toBe('node scripts/run-supabase-dev.mjs types')
  })

  it('uses an isolated stable CLI home instead of the default Supabase auth home', () => {
    const defaultAuthHome = 'C:\\Users\\developer\\AppData\\Roaming\\Supabase'
    const env = { LOCALAPPDATA: 'C:\\Users\\developer\\AppData\\Local', SUPABASE_HOME: defaultAuthHome }
    const isolatedHome = resolveSupabaseDevHome({ env, platform: 'win32' })

    expect(isolatedHome).toBe('C:\\Users\\developer\\AppData\\Local\\SupabaseCLI\\company-operations-dev')
    expect(isolatedHome).not.toBe(defaultAuthHome)
  })

  it('uses an XDG state directory for the isolated CLI home on Unix', () => {
    const home = resolveSupabaseDevHome({ env: { XDG_STATE_HOME: '/var/state' }, platform: 'linux' })

    expect(home).toBe('/var/state/SupabaseCLI/company-operations-dev')
  })

  it('falls back to the Unix home state directory when XDG state is absent', () => {
    const home = resolveSupabaseDevHome({ env: { HOME: '/home/developer' }, platform: 'darwin' })

    expect(home).toBe('/home/developer/.local/state/SupabaseCLI/company-operations-dev')
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

  it('rejects duplicate required dotenv assignments', () => {
    const root = makeWorktree({
      projectRef: CANONICAL_DEV_PROJECT_REF,
      envLines: [
        `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
        `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
        'NUXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test-key',
      ],
    })

    expect(() => assertCloudDevTarget({ cwd: root })).toThrow('NUXT_PUBLIC_SUPABASE_URL must be assigned exactly once')
  })

  it.each([
    `http://${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
    `https://user:password@${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
    `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co:8443`,
    `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co/not-allowed`,
    `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co?query=not-allowed`,
    `https://${CANONICAL_DEV_PROJECT_REF}.supabase.co#fragment-not-allowed`,
  ])('rejects a non-canonical Cloud DEV URL shape', url => {
    const root = makeWorktree({ projectRef: CANONICAL_DEV_PROJECT_REF, url })

    expect(() => assertCloudDevTarget({ cwd: root })).toThrow('NUXT_PUBLIC_SUPABASE_URL does not match canonical Cloud DEV target')
  })

  it('accepts a structurally valid legacy anon JWT and rejects non-anon or malformed keys', () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const legacyAnonJwt = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'anon' })}.signature`
    const serviceRoleJwt = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'service_role' })}.signature`
    const validRoot = makeWorktree({
      projectRef: CANONICAL_DEV_PROJECT_REF,
      envLines: [
        `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
        `NUXT_PUBLIC_SUPABASE_ANON_KEY=${legacyAnonJwt}`,
      ],
    })
    const serviceRoot = makeWorktree({
      projectRef: CANONICAL_DEV_PROJECT_REF,
      envLines: [
        `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
        `NUXT_PUBLIC_SUPABASE_ANON_KEY=${serviceRoleJwt}`,
      ],
    })
    const malformedRoot = makeWorktree({
      projectRef: CANONICAL_DEV_PROJECT_REF,
      envLines: [
        `NUXT_PUBLIC_SUPABASE_URL=https://${CANONICAL_DEV_PROJECT_REF}.supabase.co`,
        'NUXT_PUBLIC_SUPABASE_ANON_KEY=sb_secret_not-allowed',
      ],
    })

    expect(() => assertCloudDevTarget({ cwd: validRoot })).not.toThrow()
    expect(() => assertCloudDevTarget({ cwd: serviceRoot })).toThrow('NUXT_PUBLIC_SUPABASE_ANON_KEY is invalid')
    expect(() => assertCloudDevTarget({ cwd: malformedRoot })).toThrow('NUXT_PUBLIC_SUPABASE_ANON_KEY is invalid')
  })
})
