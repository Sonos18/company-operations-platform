import { createSupabaseOpportunityRoutes } from '../../../../features/opportunities/opportunity.routes'
import { runApiRoute } from '../../../../utils/api-error'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseOpportunityRoutes(event).create(event)))
