import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as supabaseConfig from '../../../server/utils/supabase-config'

const parseSupabaseRuntimeConfig = supabaseConfig.parseSupabaseRuntimeConfig

function parseSupabaseAdminConfig(input: unknown) {
  const parser = (supabaseConfig as Record<string, unknown>).parseSupabaseAdminConfig
  expect(parser).toBeTypeOf('function')
  if (typeof parser !== 'function') return undefined
  return (parser as (value: unknown) => unknown)(input)
}

describe('parseSupabaseRuntimeConfig', () => {
  it('accepts valid values', () => {
    expect(parseSupabaseRuntimeConfig({
      url: 'http://127.0.0.1:54321',
      anonKey: 'local-anon-key',
    })).toEqual({
      url: 'http://127.0.0.1:54321',
      anonKey: 'local-anon-key',
    })
  })

  it.each([
    [{ url: '', anonKey: 'key' }, 'SUPABASE_URL_INVALID'],
    [{ url: 'not-a-url', anonKey: 'key' }, 'SUPABASE_URL_INVALID'],
    [{ url: 'http://127.0.0.1:54321', anonKey: '' }, 'SUPABASE_ANON_KEY_MISSING'],
  ])('rejects invalid values %#', (input, code) => {
    expect(() => parseSupabaseRuntimeConfig(input)).toThrow(code)
  })

  it('parses a private Auth admin credential without requiring a JWT-shaped value', () => {
    expect(parseSupabaseAdminConfig({
      url: 'http://127.0.0.1:54321',
      serviceRoleKey: 'sb_secret_non-jwt-value',
    })).toEqual({
      url: 'http://127.0.0.1:54321',
      serviceRoleKey: 'sb_secret_non-jwt-value',
    })
  })

  it.each([
    [{ url: 'http://127.0.0.1:54321', serviceRoleKey: '' }, 'SUPABASE_SERVICE_ROLE_KEY_MISSING'],
    [{ url: 'http://127.0.0.1:54321', serviceRoleKey: '   ' }, 'SUPABASE_SERVICE_ROLE_KEY_MISSING'],
    [{ url: 'not-a-url', serviceRoleKey: 'sb_secret_value' }, 'SUPABASE_URL_INVALID'],
  ])('fails closed for unusable private Auth admin config %#', (input, code) => {
    expect(() => parseSupabaseAdminConfig(input)).toThrow(code)
  })

  it('keeps the Auth admin credential outside the public runtime configuration', () => {
    const nuxtConfig = readFileSync(resolve(import.meta.dirname, '../../..', 'nuxt.config.ts'), 'utf8')
    const publicConfig = nuxtConfig.slice(
      nuxtConfig.indexOf('public: {'),
      nuxtConfig.indexOf('\n  },\n  typescript:'),
    )

    expect(nuxtConfig).toContain("supabaseServiceRoleKey: ''")
    expect(publicConfig).not.toContain('supabaseServiceRoleKey')
    expect(() => parseSupabaseRuntimeConfig({
      url: 'http://127.0.0.1:54321',
      anonKey: 'public-anon-key',
      serviceRoleKey: 'sb_secret_wrong_boundary',
    })).toThrow()
  })
})
