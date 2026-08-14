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
  it('loads only .env.local for local Nuxt development', () => {
    expect(packageJson.scripts.dev).toBe('nuxt dev --dotenv .env.local')
    expect(envExample).toContain('# Copy this file to .env.local')
    expect(envExample).toContain('NUXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321')
  })

  it('leaves production build configuration to the deploy environment', () => {
    expect(packageJson.scripts.build).toBe('nuxt build')
    expect(nuxtConfig).toContain("supabaseUrl: ''")
    expect(nuxtConfig).toContain("supabaseAnonKey: ''")
    expect(nuxtConfig).not.toContain('process.env.NUXT_PUBLIC_SUPABASE')
  })

  it('makes every database target explicit', () => {
    expect(packageJson.scripts['db:local:reset']).toBe('supabase db reset --local')
    expect(packageJson.scripts['db:local:test']).toBe('supabase test db --local')
    expect(packageJson.scripts['db:local:types']).toBe(
      'supabase gen types typescript --local > shared/types/database.types.ts',
    )
    expect(packageJson.scripts['db:cloud:status']).toBe('supabase migration list --linked')
    expect(packageJson.scripts['db:cloud:dry-run']).toBe('supabase db push --linked --dry-run')
    expect(packageJson.scripts['db:cloud:push']).toBe('supabase db push --linked')
    expect(Object.values(packageJson.scripts)).not.toContain('supabase db reset --linked')
  })
})
