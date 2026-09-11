import type { H3Event } from 'h3'
import { createSupabaseAuthorizationReader } from '../authorization/authorization.service'
import { createSupabaseTenancyReader, createTenancyService } from '../tenancy/tenancy.service'
import { requireAuthenticatedRequest } from '../../utils/auth-context'

export async function c1RequestContext(event: H3Event, companyId: string) {
  const { actor, db } = await requireAuthenticatedRequest(event)
  const tenancy = createTenancyService(createSupabaseTenancyReader(db), createSupabaseAuthorizationReader(db))
  return { actorId: actor.userId, requestId: event.context.requestId, db, ...await tenancy.resolveCompanyContext(actor.userId, companyId) }
}
