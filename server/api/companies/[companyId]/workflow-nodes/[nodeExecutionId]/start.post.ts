import { createSupabaseWorkflowRoutes } from '../../../../../features/workflow/workflow.routes'
import { runApiRoute } from '../../../../../utils/api-error'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseWorkflowRoutes(event).startNode(event)))
