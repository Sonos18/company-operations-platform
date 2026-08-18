import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../../shared/types/database.types'
import type { EmployeeInvitationAuthAdmin } from '../features/employees/employee-invitation-auth'
import type { SupabaseAdminConfig, SupabaseRuntimeConfig } from './supabase-config'

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

export interface SupabaseAdminClient {
  auth: Pick<SupabaseClient<Database>['auth'], 'admin'>
}

const authUserIdSchema = z.string().uuid()
const duplicateInviteErrorSchema = z.object({
  code: z.enum(['email_exists', 'user_already_exists']),
}).passthrough()
const authUserSchema = z.object({
  id: authUserIdSchema,
  email: z.string().trim().toLowerCase().email(),
})
const paginationSchema = z.object({ users: z.array(z.unknown()) }).passthrough()
const authUserPageLimit = 100
const authUserPageSize = 100

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isDocumentedDuplicateInviteError(error: unknown): boolean {
  return duplicateInviteErrorSchema.safeParse(error).success
}

export function createSupabaseAdminClient(config: SupabaseAdminConfig): SupabaseAdminClient {
  const client = createClient<Database>(config.url, config.serviceRoleKey, { auth })
  return { auth: { admin: client.auth.admin } }
}

export function createSupabaseInvitationAuthAdmin(
  client: SupabaseAdminClient,
): EmployeeInvitationAuthAdmin {
  return {
    async inviteUser(email) {
      try {
        const { data, error } = await client.auth.admin.inviteUserByEmail(normalizeEmail(email))
        if (error) {
          return isDocumentedDuplicateInviteError(error)
            ? { kind: 'existing' }
            : { kind: 'failed' }
        }
        const userId = authUserIdSchema.safeParse(data.user?.id)
        return userId.success ? { kind: 'invited', userId: userId.data } : { kind: 'failed' }
      } catch {
        return { kind: 'failed' }
      }
    },
    async findUserByEmail(email) {
      const normalizedEmail = normalizeEmail(email)
      const matchedUserIds: string[] = []
      const seenUserIds = new Set<string>()
      for (let page = 1; page <= authUserPageLimit; page += 1) {
        try {
          const { data, error } = await client.auth.admin.listUsers({ page, perPage: authUserPageSize })
          const parsed = paginationSchema.safeParse(data)
          if (error || !parsed.success) return { kind: 'failed' }
          const users = z.array(authUserSchema).safeParse(parsed.data.users)
          if (!users.success) return { kind: 'failed' }
          for (const user of users.data) {
            if (seenUserIds.has(user.id)) return { kind: 'failed' }
            seenUserIds.add(user.id)
            if (user.email === normalizedEmail) matchedUserIds.push(user.id)
          }
          if (users.data.length < authUserPageSize) {
            if (matchedUserIds.length === 1) return { kind: 'found', userId: matchedUserIds[0]! }
            return matchedUserIds.length === 0 ? { kind: 'not_found' } : { kind: 'failed' }
          }
        } catch {
          return { kind: 'failed' }
        }
      }
      return { kind: 'failed' }
    },
  }
}
