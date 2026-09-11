import { createSupabaseCostSettingsRoutes } from '../../../features/costs/cost-settings.routes'
import { runApiRoute } from '../../../utils/api-error'
export default defineEventHandler(event => runApiRoute(event, () => createSupabaseCostSettingsRoutes(event).get()))
