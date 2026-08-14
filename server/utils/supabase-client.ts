import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/types/database.types'
import type { SupabaseRuntimeConfig } from './supabase-config'

const auth = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
} as const

export function createSupabaseAnonClient(config: SupabaseRuntimeConfig) {
  return createClient<Database>(config.url, config.anonKey, { auth })
}

export function createSupabaseUserClient(
  config: SupabaseRuntimeConfig,
  accessToken: string,
) {
  return createClient<Database>(config.url, config.anonKey, {
    auth,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export type UserSupabaseClient = ReturnType<typeof createSupabaseUserClient>
