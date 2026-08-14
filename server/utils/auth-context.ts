import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { AppApiError } from './api-error'
import { parseSupabaseRuntimeConfig } from './supabase-config'
import { createSupabaseAnonClient, createSupabaseUserClient } from './supabase-client'

interface VerifiedUser {
  id: string
  email?: string
}

export interface UserVerifier {
  getUser(token: string): Promise<{
    data: { user: VerifiedUser | null }
    error: Error | null
  }>
}

export interface AuthenticatedActor {
  userId: string
  email: string | null
  accessToken: string
}

function bearerToken(value: string | undefined): string {
  const accessToken = value?.match(/^Bearer ([^\s]+)$/)?.[1]
  if (!accessToken) {
    throw new AppApiError(401, 'AUTH_REQUIRED', 'Bạn cần đăng nhập để tiếp tục.')
  }

  return accessToken
}

export async function authenticateBearer(
  authorization: string | undefined,
  verifier: UserVerifier,
): Promise<AuthenticatedActor> {
  const accessToken = bearerToken(authorization)
  const { data, error } = await verifier.getUser(accessToken)
  if (error || !data.user) {
    throw new AppApiError(401, 'AUTH_INVALID', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.')
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    accessToken,
  }
}

export async function requireAuthenticatedRequest(event: H3Event) {
  const runtime = useRuntimeConfig(event)
  const config = parseSupabaseRuntimeConfig({
    url: runtime.public.supabaseUrl,
    anonKey: runtime.public.supabaseAnonKey,
  })
  const anon = createSupabaseAnonClient(config)
  const actor = await authenticateBearer(getHeader(event, 'authorization'), {
    getUser: token => anon.auth.getUser(token),
  })

  return {
    actor,
    db: createSupabaseUserClient(config, actor.accessToken),
  }
}
