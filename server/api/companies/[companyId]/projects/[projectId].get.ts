import { createSupabaseProjectRegisterRoutes } from '../../../../features/project-register/project-register.routes'
import { runApiRoute } from '../../../../utils/api-error'
export default defineEventHandler(event => runApiRoute(event, () => createSupabaseProjectRegisterRoutes(event).get()))
