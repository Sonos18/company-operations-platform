import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const envExample = readFileSync(resolve(root, '.env.example'), 'utf8')
const nuxtConfig = readFileSync(resolve(root, 'nuxt.config.ts'), 'utf8')

describe('Supabase environment wiring', () => {
  it('loads an ignored Cloud DEV environment for local Nuxt development', () => {
    expect(packageJson.scripts.dev).toBe('nuxt dev --dotenv .env.local')
    expect(envExample).toContain('# Supabase Cloud DEV')
    expect(envExample).toContain('NUXT_PUBLIC_SUPABASE_URL=')
    expect(envExample).toContain('NUXT_PUBLIC_SUPABASE_ANON_KEY=')
    expect(envExample).not.toContain('127.0.0.1')
  })

  it('leaves production build configuration to the deploy environment', () => {
    expect(packageJson.scripts.build).toBe('nuxt build')
    expect(nuxtConfig).toContain("supabaseUrl: ''")
    expect(nuxtConfig).toContain("supabaseAnonKey: ''")
    expect(nuxtConfig).not.toContain('process.env.NUXT_PUBLIC_SUPABASE')
  })

  it('exposes an explicit linked DEV workflow and an isolated local fallback', () => {
    expect(packageJson.scripts['db:dev:status']).toBe('supabase migration list --linked')
    expect(packageJson.scripts['db:dev:dry-run']).toBe('supabase db push --linked --dry-run')
    expect(packageJson.scripts['db:dev:push']).toBe('supabase db push --linked')
    expect(packageJson.scripts['db:dev:test']).toBe('supabase test db --linked')
    expect(packageJson.scripts['db:dev:types']).toBe(
      'supabase gen types typescript --linked > shared/types/database.types.ts',
    )
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
})
