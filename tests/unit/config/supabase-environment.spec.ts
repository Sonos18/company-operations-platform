import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const envExampleSource = readFileSync(resolve(root, '.env.example'), 'utf8')
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

function parseEnv(source: string): Record<string, string> {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter(line => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')

        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

function canonicalPermissionValues(migration: string) {
  const valuesBlock = migration.match(
    /insert into public\.permissions \(code, module, name, description\) values\s+([\s\S]*?)\s+on conflict \(code\) do update/,
  )?.[1]
  if (!valuesBlock) throw new Error('canonical permission VALUES block is missing')

  return [...valuesBlock.matchAll(/\(([^()]*)\)/g)].map((match) => {
    const fields = match[1].match(/'[^']*'/g) ?? []
    return fields.map(field => field.slice(1, -1))
  })
}

describe('Supabase environment wiring', () => {
  it('loads an ignored Cloud DEV environment for local Nuxt development', () => {
    const envExample = parseEnv(envExampleSource)

    expect(packageJson.scripts.dev).toBe('nuxt dev --dotenv .env.local')
    expect(envExampleSource).toContain('# Supabase Cloud DEV')
    expect(envExample.NUXT_PUBLIC_SUPABASE_URL).toBe('')
    expect(envExample.NUXT_PUBLIC_SUPABASE_ANON_KEY).toBe('')
    expect(gitignore).toMatch(/^\.env\.local$/m)
    expect(devPatExample.replace(/\r\n?/g, '\n')).toBe('SUPABASE_DEV_ACCESS_TOKEN=\n')
    expect(gitignore).toMatch(/^\.supabase\.dev\.env\.local$/m)
  })

  it('leaves production build configuration to the deploy environment', () => {
    expect(packageJson.scripts.build).toBe('nuxt build')
    expect(nuxtConfig).toContain("supabaseUrl: ''")
    expect(nuxtConfig).toContain("supabaseAnonKey: ''")
    expect(nuxtConfig).not.toContain('process.env.NUXT_PUBLIC_SUPABASE')
  })

  it('uses the generic variables for the sole Taskovia application database', () => {
    const envExample = parseEnv(envExampleSource)
    const supabaseVariables = Object.keys(envExample)
      .filter(name => name.includes('SUPABASE'))
      .sort()

    expect(supabaseVariables).toEqual([
      'NUXT_PUBLIC_SUPABASE_ANON_KEY',
      'NUXT_PUBLIC_SUPABASE_URL',
      'NUXT_SUPABASE_SERVICE_ROLE_KEY',
    ])
    expect(envExample.NUXT_PUBLIC_SUPABASE_URL).toBe('')
    expect(envExample.NUXT_PUBLIC_SUPABASE_ANON_KEY).toBe('')
    expect(envExample.NUXT_SUPABASE_SERVICE_ROLE_KEY).toBe('')

    expect(nuxtConfig).toContain("supabaseServiceRoleKey: ''")
    expect(nuxtConfig).toContain("supabaseUrl: ''")
    expect(nuxtConfig).toContain("supabaseAnonKey: ''")
    expect(nuxtConfig).not.toMatch(/(?:TASKOVIA_SUPABASE|taskoviaSupabase)/)
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

    expect(migration).toContain('on conflict (id) do update')
    expect(migration).toContain('name = excluded.name')
    expect(migration).toContain('is_active = excluded.is_active')
    expect(migration).toContain('on conflict (code) do update')
    expect(migration).toContain('description = excluded.description')
    expect(devRunner).toContain('expected_departments')
    expect(devRunner).toContain('expected_roles')
    expect(devRunner).toContain('expected_role_permissions')
    expect(devRunner).toContain('company_admin')
    expect(devRunner).toContain('company_role_assignments')
  })

  it('keeps the canonical permission VALUES contract at 34 complete four-string tuples', () => {
    const values = canonicalPermissionValues(canonicalCatalogMigration())

    expect(values).toHaveLength(34)
    expect(values.map(fields => fields.length)).toEqual(Array(34).fill(4))
    expect(values.map(([code]) => code)).toEqual([
      'employee.read_directory', 'employee.read_self_private', 'employee.read_all', 'employee.read_private', 'employee.create', 'employee.update', 'employee.offboard',
      'account.invite', 'account.disable', 'role.read', 'role.assign', 'role.revoke',
      'supplier.read', 'supplier.create', 'supplier.update', 'quotation_request.create', 'quotation_request.update',
      'inventory.read', 'stock_count.create', 'stock_count.update', 'stock_adjustment.read', 'stock_adjustment.approve',
      'technical_document.read', 'technical_document.update', 'drawing.read', 'drawing.create', 'drawing.update',
      'accounting_document.read', 'accounting_document.update', 'supplier_payment.approve', 'inventory_value.read',
      'project.read', 'task.read_assigned', 'task.update_assigned',
    ])
  })
})
