import { createClient } from '@supabase/supabase-js'
import {
  createSupabaseAuthRepository,
  type NarrowSupabaseAuthClient,
} from '../repositories/auth/supabase-auth.repository'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const client = createClient(
    config.public.supabaseUrl,
    config.public.supabaseAnonKey,
    {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    },
  )
  const authRepository = createSupabaseAuthRepository(client as unknown as NarrowSupabaseAuthClient)

  return {
    provide: { authRepository },
  }
})
