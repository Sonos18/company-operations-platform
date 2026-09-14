import { createSupabaseCostSourceReadRoutes } from '../../../../../../features/costs/source-read.routes'
import { runApiRoute } from '../../../../../../utils/api-error'
export default defineEventHandler(event => runApiRoute(event, () => createSupabaseCostSourceReadRoutes(event).figures()))
