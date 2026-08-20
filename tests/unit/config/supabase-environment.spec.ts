import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const envExample = readFileSync(resolve(root, '.env.example'), 'utf8')
const devPatExample = readFileSync(resolve(root, '.supabase.dev.env.example'), 'utf8')
const gitignore = readFileSync(resolve(root, '.gitignore'), 'utf8')
const nuxtConfig = readFileSync(resolve(root, 'nuxt.config.ts'), 'utf8')
const devRunner = readFileSync(resolve(root, 'scripts/run-supabase-dev.mjs'), 'utf8')

function canonicalCatalogMigration() {
  const filename = readdirSync(resolve(root, 'supabase/migrations'))
    .find(file => file.endsWith('_bootstrap_vqh_employee_rbac_catalog.sql'))
  if (!filename) throw new Error('canonical VQH catalog migration is missing')
  return readFileSync(resolve(root, 'supabase/migrations', filename), 'utf8')
}

describe('Supabase environment wiring', () => {
  it('loads an ignored Cloud DEV environment for local Nuxt development', () => {
    expect(packageJson.scripts.dev).toBe('nuxt dev --dotenv .env.local')
    expect(envExample).toContain('# Supabase Cloud DEV')
    expect(envExample).toMatch(/^NUXT_PUBLIC_SUPABASE_URL=$/m)
    expect(envExample).toMatch(/^NUXT_PUBLIC_SUPABASE_ANON_KEY=$/m)
    expect(gitignore).toMatch(/^\.env\.local$/m)
    expect(devPatExample.replace(/\r\n?/g, '\n')).toBe('SUPABASE_DEV_ACCESS_TOKEN=\n')
    expect(gitignore).toMatch(/^\.supabase\.dev\.env\.local$/m)
    expect(envExample).not.toContain('127.0.0.1')
  })

  it('leaves production build configuration to the deploy environment', () => {
    expect(packageJson.scripts.build).toBe('nuxt build')
    expect(nuxtConfig).toContain("supabaseUrl: ''")
    expect(nuxtConfig).toContain("supabaseAnonKey: ''")
    expect(nuxtConfig).not.toContain('process.env.NUXT_PUBLIC_SUPABASE')
  })

  it('exposes an explicit linked DEV workflow and an isolated local fallback', () => {
    expect(packageJson.scripts['db:dev:target']).toBe('node scripts/assert-cloud-dev-target.mjs')
    expect(packageJson.scripts).not.toHaveProperty('db:dev:login')
    expect(packageJson.scripts['db:dev:auth-check']).toBe('node scripts/run-supabase-dev.mjs auth-check')
    expect(packageJson.scripts['db:dev:link']).toBe('node scripts/run-supabase-dev.mjs link')
    expect(packageJson.scripts['db:dev:status']).toBe('node scripts/run-supabase-dev.mjs status')
    expect(packageJson.scripts['db:dev:dry-run']).toBe('node scripts/run-supabase-dev.mjs dry-run')
    expect(packageJson.scripts['db:dev:push']).toBe('node scripts/run-supabase-dev.mjs push')
    expect(packageJson.scripts['db:dev:test']).toBe('node scripts/run-supabase-dev.mjs pg-tap')
    expect(packageJson.scripts['db:dev:types']).toBe('node scripts/run-supabase-dev.mjs types')
    expect(packageJson.scripts['db:dev:rls-smoke']).toBe('node scripts/run-supabase-dev.mjs rls-smoke')
    expect(packageJson.scripts['db:dev:canonical-check']).toBe('node scripts/run-supabase-dev.mjs canonical-check')
    expect(packageJson.scripts['db:dev:advisors:security']).toBe('node scripts/run-supabase-dev.mjs advisors-security')
    expect(packageJson.scripts['db:dev:advisors:performance']).toBe('node scripts/run-supabase-dev.mjs advisors-performance')
    expect(packageJson.scripts['verify:app']).toBe(
      'pnpm test:unit && pnpm typecheck && pnpm lint && pnpm build',
    )
    expect(packageJson.scripts['verify:dev']).toBe(
      'pnpm db:dev:status && pnpm db:dev:dry-run && pnpm db:dev:types && pnpm verify:app',
    )
    expect(packageJson.scripts['verify:dev']).not.toContain('pnpm db:dev:test')
    expect(packageJson.scripts['verify:backend:local']).toContain('pnpm db:local:reset')
  })

  it('rejects legacy aliases and every remote reset or seed variant', () => {
    expect(packageJson.scripts).not.toHaveProperty('db:reset')
    expect(packageJson.scripts).not.toHaveProperty('db:test')
    expect(packageJson.scripts).not.toHaveProperty('db:types')
    expect(Object.keys(packageJson.scripts).filter(name => name.startsWith('db:cloud:'))).toEqual([])

    const remoteTarget = /(?:--linked\b|--project-ref(?:=|\s)|--db-url(?:=|\s))/
    for (const [name, script] of Object.entries(packageJson.scripts)) {
      if (/\bsupabase db reset\b/.test(script)) {
        expect(script, `${name} must reset only the local fallback`).toMatch(/--local\b/)
        expect(script, `${name} must not reset a remote target`).not.toMatch(remoteTarget)
      }
      expect(script, `${name} must not deploy seed data remotely`).not.toMatch(/--include-seed\b/)
    }
  })

  it('makes the canonical VQH catalog and normalized company-admin assignment a Cloud DEV boundary', () => {
    const migration = canonicalCatalogMigration()

    expect(migration).toContain("'10000000-0000-4000-8000-000000000010'")
    expect(migration).toContain("'10000000-0000-4000-8000-000000000020'")
    expect(migration).toContain("'company_admin'")
    expect(migration).toContain('role_permissions')
    expect(migration).toContain('expected_role_permissions')
    expect(migration).not.toMatch(/auth\.users|public\.employees|tenant_memberships|company_memberships|company_role_assignments/)

    expect(devRunner).toContain('count(*) from public.departments')
    expect(devRunner).toContain('<> 7')
    expect(devRunner).toContain('count(*) from public.roles')
    expect(devRunner).toContain('<> 8')
    expect(devRunner).toContain('count(*) from public.permissions')
    expect(devRunner).toContain('<> 34')
    expect(devRunner).toContain('count(*) from public.role_permissions')
    expect(devRunner).toContain('<> 71')
    expect(devRunner).toContain('company_admin')
    expect(devRunner).toContain('company_role_assignments')
  })
})
