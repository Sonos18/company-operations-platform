import { createSupabaseAccountingSourceRoutes } from '../../../../../features/costs/accounting-source.routes'
import { runApiRoute } from '../../../../../utils/api-error'
export default defineEventHandler(event => runApiRoute(event, () => createSupabaseAccountingSourceRoutes(event).resolveIssue()))
