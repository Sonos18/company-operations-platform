import { createSupabaseMaterialProcurementRoutes } from '../../../../../features/costs/material-procurement/routes'
import { runApiRoute } from '../../../../../utils/api-error'
export default defineEventHandler(event => runApiRoute(event, () => createSupabaseMaterialProcurementRoutes(event).listMaterials(event)))
