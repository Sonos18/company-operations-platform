import { runApiRoute } from '../../../../../utils/api-error'
import { createSupabaseFileRoutes } from '../../../../../features/files/file.routes'
export default defineEventHandler(event => runApiRoute(event, () => createSupabaseFileRoutes(event).preview()))
