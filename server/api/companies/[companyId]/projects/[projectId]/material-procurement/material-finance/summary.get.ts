import { createSupabaseMaterialFinanceReadRoutes } from '../../../../../../../features/costs/material-finance/finance-read-routes'
import { runApiRoute } from '../../../../../../../utils/api-error'
export default defineEventHandler(event => runApiRoute(event, () => createSupabaseMaterialFinanceReadRoutes().projectSummary(event)))
