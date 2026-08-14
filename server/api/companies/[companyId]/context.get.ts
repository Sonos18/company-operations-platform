import { getRouterParam } from 'h3'
import { companyRequestContextSchema } from '../../../../shared/schemas/session'
import { createSupabaseTenancyReader, createTenancyService } from '../../../features/tenancy/tenancy.service'
import { AppApiError, runApiRoute } from '../../../utils/api-error'
import { requireAuthenticatedRequest } from '../../../utils/auth-context'

export default defineEventHandler(event => runApiRoute(event, async () => {
  const companyId = getRouterParam(event, 'companyId')
  if (!companyId) {
    throw new AppApiError(
      400,
      'COMPANY_CONTEXT_REQUIRED',
      'Bạn cần chọn công ty để tiếp tục.',
    )
  }
  const { actor, db } = await requireAuthenticatedRequest(event)
  const service = createTenancyService(createSupabaseTenancyReader(db))
  return companyRequestContextSchema.parse(
    await service.resolveCompanyContext(actor.userId, companyId),
  )
}))
