import { describe, expect, it } from 'vitest'
import { parseSupabaseRuntimeConfig } from '../../../server/utils/supabase-config'

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
})
