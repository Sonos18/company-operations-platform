import { createSupabaseCostEvidenceRoutes } from '../../../../../../features/costs/evidence/cost-evidence.routes'
import { runApiRoute } from '../../../../../../utils/api-error'
export default defineEventHandler(event => runApiRoute(event, () => createSupabaseCostEvidenceRoutes(event).linkCost(event)))
