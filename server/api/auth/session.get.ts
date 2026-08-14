import { sessionResponseSchema } from '../../../shared/schemas/session'
import { createSupabaseTenancyReader, createTenancyService } from '../../features/tenancy/tenancy.service'
import { runApiRoute } from '../../utils/api-error'
import { requireAuthenticatedRequest } from '../../utils/auth-context'

export default defineEventHandler(event => runApiRoute(event, async () => {
  const { actor, db } = await requireAuthenticatedRequest(event)
  const service = createTenancyService(createSupabaseTenancyReader(db))
  return sessionResponseSchema.parse({
    user: { id: actor.userId, email: actor.email },
    companies: await service.listCompanies(actor.userId),
  })
}))
