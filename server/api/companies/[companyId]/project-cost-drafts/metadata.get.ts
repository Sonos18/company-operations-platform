import { createSupabaseProjectCostRoutes } from '../../../../features/costs/project-cost.routes'
import { runApiRoute } from '../../../../utils/api-error'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseProjectCostRoutes(event).draftManagementMetadata()))
