import { getRouterParam } from 'h3'
import { z } from 'zod'
import { companyRequestContextSchema } from '../../../../shared/schemas/session'
import { createSupabaseAuthorizationReader } from '../../../features/authorization/authorization.service'
import { createSupabaseTenancyReader, createTenancyService } from '../../../features/tenancy/tenancy.service'
import { AppApiError, runApiRoute } from '../../../utils/api-error'
import { requireAuthenticatedRequest } from '../../../utils/auth-context'

export default defineEventHandler(event => runApiRoute(event, async () => {
  const companyId = z.string().uuid().safeParse(getRouterParam(event, 'companyId'))
  if (!companyId.success) {
    throw new AppApiError(
      400,
      'COMPANY_CONTEXT_REQUIRED',
      'Bạn cần chọn công ty để tiếp tục.',
    )
  }
  const { actor, db } = await requireAuthenticatedRequest(event)
  const service = createTenancyService(
    createSupabaseTenancyReader(db),
    createSupabaseAuthorizationReader(db),
  )
  return companyRequestContextSchema.parse(
    await service.resolveCompanyContext(actor.userId, companyId.data),
  )
}))
