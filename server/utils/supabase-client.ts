import { createClient } from '@supabase/supabase-js'
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

interface AuthAdminUser {
  id: unknown
  email?: unknown
}

interface AuthAdminApi {
  inviteUserByEmail(email: string): Promise<{
    data: { user: AuthAdminUser | null }
    error: unknown
  }>
  listUsers(options: { page: number, perPage: number }): Promise<{
    data: {
      users: AuthAdminUser[]
      nextPage?: number | null
    }
    error: unknown
  }>
}

export interface SupabaseAdminClient {
  auth: {
    admin: AuthAdminApi
  }
}

const authUserIdSchema = z.string().uuid()
const duplicateInviteErrorSchema = z.object({
  code: z.enum(['email_exists', 'user_already_exists']),
}).passthrough()
const paginationSchema = z.object({
  users: z.array(z.object({
    id: z.unknown(),
    email: z.unknown().optional(),
  }).passthrough()),
  nextPage: z.number().int().positive().nullable().optional(),
}).passthrough()
const authUserPageLimit = 100

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isDocumentedDuplicateInviteError(error: unknown): boolean {
  return duplicateInviteErrorSchema.safeParse(error).success
}

export function createSupabaseAdminClient(config: SupabaseAdminConfig): SupabaseAdminClient {
  return createClient<Database>(config.url, config.serviceRoleKey, { auth }) as unknown as SupabaseAdminClient
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
      let page = 1
      const visitedPages = new Set<number>()
      for (let attempts = 0; attempts < authUserPageLimit; attempts += 1) {
        if (visitedPages.has(page)) return { kind: 'failed' }
        visitedPages.add(page)
        try {
          const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
          const parsed = paginationSchema.safeParse(data)
          if (error || !parsed.success) return { kind: 'failed' }
          const exactMatch = parsed.data.users.find(user => (
            typeof user.email === 'string' && normalizeEmail(user.email) === normalizedEmail
          ))
          if (exactMatch) {
            const userId = authUserIdSchema.safeParse(exactMatch.id)
            return userId.success ? { kind: 'found', userId: userId.data } : { kind: 'failed' }
          }
          const nextPage = parsed.data.nextPage
          if (nextPage === undefined || nextPage === null) return { kind: 'not_found' }
          if (nextPage <= page || visitedPages.has(nextPage)) return { kind: 'failed' }
          page = nextPage
        } catch {
          return { kind: 'failed' }
        }
      }
      return { kind: 'failed' }
    },
  }
}
