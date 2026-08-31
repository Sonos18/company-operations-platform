import { createSupabaseStage01ConfigRoutes } from '../../../../../../features/stage01-config/stage01-config.routes'
import { runApiRoute } from '../../../../../../utils/api-error'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseStage01ConfigRoutes(event).updateDraft(event)))
