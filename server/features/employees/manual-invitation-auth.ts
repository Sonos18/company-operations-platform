import { z } from 'zod'
import type { SupabaseAdminClient } from '../../utils/supabase-client'
export interface InvitationScope { tenantId: string; companyId: string }
export type ManualInvitationIdentity =
  | { kind: 'new' }
  | { kind: 'pending'; userId: string }
  | { kind: 'active' | 'foreign' | 'failed' }
export interface ManualInvitationAuth {
  inspect(email: string, scope: InvitationScope): Promise<ManualInvitationIdentity>
  generate(email: string, scope: InvitationScope, identity: ManualInvitationIdentity): Promise<{ userId: string; tokenHash: string }>
  assertPending(userId: string, email: string, scope: InvitationScope): Promise<void>
}
const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  email_confirmed_at: z.string().nullable().optional(),
  confirmed_at: z.string().nullable().optional(),
  last_sign_in_at: z.string().nullable().optional(),
  invited_at: z.string().nullable().optional(),
  banned_until: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
  app_metadata: z.record(z.string(), z.unknown()),
}).passthrough()
type User = z.infer<typeof userSchema>
const markerSchema = z.object({ tenantId: z.string().uuid(), companyId: z.string().uuid() }).strict()
function isActive(user: User) {
  return Boolean(user.email_confirmed_at || user.confirmed_at || user.last_sign_in_at || user.deleted_at
    || (user.banned_until && Date.parse(user.banned_until) > Date.now()))
}
function owned(user: User, scope: InvitationScope) {
  const marker = markerSchema.safeParse(user.app_metadata.taskovia_manual_invitation)
  return marker.success && marker.data.tenantId === scope.tenantId && marker.data.companyId === scope.companyId
}
function fail(): never { throw new Error('MANUAL_INVITATION_UNAVAILABLE') }
export function createSupabaseManualInvitationAuth(client: SupabaseAdminClient): ManualInvitationAuth {
  async function readPending(userId: string, email: string, scope: InvitationScope, allowDraft = false) {
    const { data, error } = await client.auth.admin.getUserById(userId)
    const parsed = userSchema.safeParse(data.user)
    if (error || !parsed.success || parsed.data.id !== userId || parsed.data.email !== email
      || isActive(parsed.data) || (!allowDraft && !parsed.data.invited_at) || !owned(parsed.data, scope)) fail()
    return parsed.data
  }
  return {
    async inspect(email, scope) {
      try {
        const seen = new Set<string>()
        let match: User | undefined
        for (let page = 1; page <= 100; page++) {
          const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
          // Other providers may have phone-only users. Inspect only matching email records.
          const parsed = z.object({ users: z.array(z.object({ id: z.string().uuid(), email: z.string().optional() }).passthrough()) }).safeParse(data)
          if (error || !parsed.success) return { kind: 'failed' }
          for (const user of parsed.data.users) {
            if (seen.has(user.id)) return { kind: 'failed' }
            seen.add(user.id)
            if (user.email?.trim().toLowerCase() !== email) continue
            const target = userSchema.safeParse(user)
            if (!target.success || match) return { kind: 'failed' }
            match = target.data
          }
          if (parsed.data.users.length < 100) {
            if (!match) return { kind: 'new' }
            if (isActive(match)) return { kind: 'active' }
            return owned(match, scope) ? { kind: 'pending', userId: match.id } : { kind: 'foreign' }
          }
        }
      } catch { return { kind: 'failed' } }
      return { kind: 'failed' }
    },
    async generate(email, scope, identity) {
      if (identity.kind !== 'new' && identity.kind !== 'pending') fail()
      let expectedUserId: string
      if (identity.kind === 'new') {
        // Store ownership atomically with creation; never adopt an existing email.
        const created = await client.auth.admin.createUser({
          email, email_confirm: false,
          app_metadata: { taskovia_manual_invitation: { tenantId: scope.tenantId, companyId: scope.companyId } },
        })
        const claimed = userSchema.safeParse(created.data.user)
        if (created.error || !claimed.success || claimed.data.email !== email
          || isActive(claimed.data) || !owned(claimed.data, scope)) fail()
        expectedUserId = claimed.data.id
      } else {
        expectedUserId = identity.userId
        await readPending(expectedUserId, email, scope, true)
      }
      const { data, error } = await client.auth.admin.generateLink({ type: 'invite', email })
      const user = userSchema.safeParse(data.user)
      const properties = z.object({ hashed_token: z.string().min(1), verification_type: z.literal('invite') }).safeParse(data.properties)
      if (error || !user.success || !properties.success || user.data.email !== email
        || isActive(user.data) || !user.data.invited_at) fail()
      if (user.data.id !== expectedUserId || !owned(user.data, scope)) fail()
      await readPending(user.data.id, email, scope)
      return { userId: user.data.id, tokenHash: properties.data.hashed_token }
    },
    async assertPending(userId, email, scope) { await readPending(userId, email, scope) },
  }
}
