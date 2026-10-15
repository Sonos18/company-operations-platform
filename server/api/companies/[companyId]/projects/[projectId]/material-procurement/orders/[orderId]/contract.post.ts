import { createSupabaseMaterialContractRoutes } from '../../../../../../../../features/costs/material-finance/contract-routes'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseMaterialContractRoutes(event).recordContract(event)))
