import { createSupabaseEngagementRoutes } from '../../../../../../features/engagements/engagement.routes'
import { runApiRoute } from '../../../../../../utils/api-error'
export default defineEventHandler(event => runApiRoute(event, () => createSupabaseEngagementRoutes(event).createComponent()))
