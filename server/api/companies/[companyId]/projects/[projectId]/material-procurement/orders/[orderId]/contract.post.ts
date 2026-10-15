import { createSupabaseMaterialContractRoutes } from '../../../../../../../../features/costs/material-finance/contract-routes'
import { runApiRoute } from '../../../../../../../../utils/api-error'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseMaterialContractRoutes(event).recordContract(event)))
