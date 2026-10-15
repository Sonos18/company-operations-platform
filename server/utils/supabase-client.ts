import type {H3Event} from 'h3'
import {parseSupabaseAdminConfig} from './supabase-config'
import type {AzureF0PrivateRpc} from '../features/costs/extraction/azure-f0-job-store'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../../shared/types/database.types'
import type { EmployeeOffboardingAuthAdmin } from '../features/employees/employee-invitation-auth'
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
  auth: {
    admin: Pick<
      SupabaseClient<Database>['auth']['admin'],
      'listUsers' | 'updateUserById' | 'generateLink' | 'getUserById' | 'createUser'
    >
  }
}

export type SupabaseEvidenceFinalizer = {
  finalize(args: {
    target_actor_id: string
    target_company_id: string
    target_id: string
    target_input: Record<string, unknown>
    target_idempotency_key: string
    target_request_id: string
  }): Promise<{ data: unknown, error: unknown }>
}

export type SupabaseMaterialEvidenceFinalizer = {
  finalize(args: {
    target_actor_id: string
    target_company_id: string
    target_project_id: string
    target_id: string
    target_input: Record<string, unknown>
    target_idempotency_key: string
    target_request_id: string
  }): Promise<{ data: unknown, error: unknown }>
}

const authUserIdSchema = z.string().uuid()
const disabledAccountBanDuration = '876000h'

export function createSupabaseAdminClient(config: SupabaseAdminConfig): SupabaseAdminClient {
  const client = createClient<Database>(config.url, config.serviceRoleKey, { auth })
  return { auth: { admin: client.auth.admin } }
}

export function createSupabaseEvidenceFinalizer(config: SupabaseAdminConfig): SupabaseEvidenceFinalizer {
  const client = createClient(config.url, config.serviceRoleKey, { auth })
  return {
    finalize: async args => await client.rpc('c1_finalize_cost_evidence_server', args),
  }
}

export function createSupabaseMaterialEvidenceFinalizer(config: SupabaseAdminConfig): SupabaseMaterialEvidenceFinalizer {
  const client = createClient(config.url, config.serviceRoleKey, { auth })
  return {
    finalize: async args => await client.rpc('c1_finalize_material_evidence_server', args),
  }
}

export type SupabaseMaterialReminderEmitter = {
  emit(args: { target_today: string }): Promise<{ data: unknown, error: unknown }>
}

export function createSupabaseMaterialReminderEmitter(config: SupabaseAdminConfig): SupabaseMaterialReminderEmitter {
  const client = createClient(config.url, config.serviceRoleKey, { auth })
  return {
    emit: async args => await client.rpc('c1_material_emit_installment_reminders', args),
  }
}

/** Service-role port for the scheduled installment reminder run; the shared secret is checked before it is used. */
export function resolveSupabaseMaterialReminderEmitter(event: H3Event): SupabaseMaterialReminderEmitter {
  const runtime = useRuntimeConfig(event)
  return createSupabaseMaterialReminderEmitter(
    parseSupabaseAdminConfig({ url: runtime.public.supabaseUrl, serviceRoleKey: runtime.supabaseServiceRoleKey }),
  )
}

/** Narrow private job/completed-result port; fresh user authorization is supplied by its request-bound wrapper. */
export function resolveSupabaseAzureF0PrivateRpc(event:H3Event):AzureF0PrivateRpc{
 const runtime=useRuntimeConfig(event)
 return createSupabaseAzureF0PrivateRpc(parseSupabaseAdminConfig({url:runtime.public.supabaseUrl,serviceRoleKey:runtime.supabaseServiceRoleKey}))
}
export function createSupabaseAzureF0PrivateRpc(config:SupabaseAdminConfig):AzureF0PrivateRpc{
 const client=createClient(config.url,config.serviceRoleKey,{auth})
 return (name,args)=>{
  if(name!=='c1_cost_ocr_azure_f0_job'&&name!=='c1_cost_ocr_azure_f0_read_result')throw new Error('AZURE_STORE_INPUT_INVALID')
  return client.rpc(name,args)
 }
}

export function createSupabaseOffboardingAuthAdmin(
  client: SupabaseAdminClient,
): EmployeeOffboardingAuthAdmin {
  return {
    async disableUser(userId) {
      try {
        const { data, error } = await client.auth.admin.updateUserById(userId, {
          ban_duration: disabledAccountBanDuration,
        })
        const returnedUserId = authUserIdSchema.safeParse(data.user?.id)
        if (error || !returnedUserId.success || returnedUserId.data !== userId) {
          return { kind: 'failed' }
        }
        return { kind: 'disabled' }
      } catch {
        return { kind: 'failed' }
      }
    },
  }
}
