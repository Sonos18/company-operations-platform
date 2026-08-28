import { createClient } from '@supabase/supabase-js'
import {
  createSupabaseAuthRepository,
  type NarrowSupabaseAuthClient,
} from '../repositories/auth/supabase-auth.repository'

export const persistentAuthClientOptions = {
  auth: {
    flowType: 'pkce' as const,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
}

export const recoveryAuthClientOptions = {
  auth: {
    flowType: 'pkce' as const,
    storageKey: 'taskovia-recovery-auth',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const client = createClient(
    config.public.supabaseUrl,
    config.public.supabaseAnonKey,
    persistentAuthClientOptions,
  )
  const recoveryClient = createClient(
    config.public.supabaseUrl,
    config.public.supabaseAnonKey,
    recoveryAuthClientOptions,
  )
  const authRepository = createSupabaseAuthRepository(
    client as unknown as NarrowSupabaseAuthClient,
    recoveryClient as unknown as NarrowSupabaseAuthClient,
  )

  return {
    provide: { authRepository },
  }
})
