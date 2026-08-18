import { createSupabaseRoleLifecycleRoutes } from '../../../../features/rbac/rbac.routes'
import { runApiRoute } from '../../../../utils/api-error'

export default defineEventHandler(event => runApiRoute(event, () => (
  createSupabaseRoleLifecycleRoutes(event).revoke(event)
)))
