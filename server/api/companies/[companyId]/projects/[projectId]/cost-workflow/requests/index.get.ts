import { createSupabaseCostWorkflowRoutes } from '../../../../../../../features/costs/workflow/cost-workflow.routes'
import { runApiRoute } from '../../../../../../../utils/api-error'
export default defineEventHandler(event=>runApiRoute(event,()=>createSupabaseCostWorkflowRoutes(event).listRequests(event)))
