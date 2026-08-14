import { z } from 'zod'

export interface SupabaseRuntimeConfig {
  url: string
  anonKey: string
}

const schema = z.object({ url: z.string(), anonKey: z.string() })

export function parseSupabaseRuntimeConfig(input: unknown): SupabaseRuntimeConfig {
  const parsed = schema.parse(input)
  if (!z.string().url().safeParse(parsed.url).success) {
    throw new Error('SUPABASE_URL_INVALID')
  }
  if (parsed.anonKey.length === 0) {
    throw new Error('SUPABASE_ANON_KEY_MISSING')
  }
  return parsed
}
