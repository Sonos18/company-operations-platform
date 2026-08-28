import { createSupabaseAuthorizationReader } from '../../features/authorization/authorization.service'
import { createAuthSessionService } from '../../features/auth/session.service'
import { createSupabaseTenancyReader, createTenancyService } from '../../features/tenancy/tenancy.service'
import { runApiRoute } from '../../utils/api-error'
import { requireAuthenticatedRequest } from '../../utils/auth-context'

export default defineEventHandler(event => runApiRoute(event, async () => {
  const { actor, db } = await requireAuthenticatedRequest(event)
  const service = createTenancyService(
    createSupabaseTenancyReader(db),
    createSupabaseAuthorizationReader(db),
  )
  return createAuthSessionService(service).getSession(actor)
}))
