import { createSupabaseCostWorkflowCutoverRoutes } from '../../../../../features/costs/workflow/cost-workflow-cutover.routes'
import { runApiRoute } from '../../../../../utils/api-error'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseCostWorkflowCutoverRoutes().readCrews(event)))
