import { z } from 'zod'

export interface SupabaseRuntimeConfig {
  url: string
  anonKey: string
}

export interface SupabaseAdminConfig {
  url: string
  serviceRoleKey: string
}

const runtimeConfigSchema = z.object({ url: z.string(), anonKey: z.string() }).strict()
const adminConfigSchema = z.object({ url: z.string(), serviceRoleKey: z.string() }).strict()

function requireUrl(url: string) {
  if (!z.string().url().safeParse(url).success) {
    throw new Error('SUPABASE_URL_INVALID')
  }
}

export function parseSupabaseRuntimeConfig(input: unknown): SupabaseRuntimeConfig {
  const parsed = runtimeConfigSchema.parse(input)
  requireUrl(parsed.url)
  if (parsed.anonKey.length === 0) {
    throw new Error('SUPABASE_ANON_KEY_MISSING')
  }
  return parsed
}

export function parseSupabaseAdminConfig(input: unknown): SupabaseAdminConfig {
  const parsed = adminConfigSchema.parse(input)
  requireUrl(parsed.url)
  if (parsed.serviceRoleKey.trim().length === 0) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING')
  }
  return parsed
}
