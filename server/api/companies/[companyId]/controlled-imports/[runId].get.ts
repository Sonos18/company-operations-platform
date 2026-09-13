import { runApiRoute } from '../../../../utils/api-error'
import { createSupabaseControlledImportRoutes } from '../../../../features/costs/imports/controlled-import.routes'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseControlledImportRoutes(event).get()))
