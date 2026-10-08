import { createSupabaseMaterialProcurementRoutes } from '../../../../../../../../features/costs/material-procurement/routes'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseMaterialProcurementRoutes(event).finalizeEvidence(event)))
