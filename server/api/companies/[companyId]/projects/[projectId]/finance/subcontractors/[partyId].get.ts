import { createSupabaseProjectFinanceRoutes } from '../../../../../../../features/costs/finance/project-finance.routes'
import { runApiRoute } from '../../../../../../../utils/api-error'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseProjectFinanceRoutes(event).subcontractor()))
