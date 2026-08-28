import { describe, expect, it, vi } from 'vitest'
import {
  persistentAuthClientOptions,
  recoveryAuthClientOptions,
} from '../../../app/plugins/supabase.client'

vi.hoisted(() => {
  vi.stubGlobal('defineNuxtPlugin', <T>(plugin: T) => plugin)
})

describe('Supabase browser Auth clients', () => {
  it('keeps normal sessions persistent and recovery sessions isolated in memory', () => {
    expect(persistentAuthClientOptions.auth).toMatchObject({
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    })
    expect(recoveryAuthClientOptions.auth).toMatchObject({
      flowType: 'pkce',
      storageKey: 'taskovia-recovery-auth',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    })
  })
})
