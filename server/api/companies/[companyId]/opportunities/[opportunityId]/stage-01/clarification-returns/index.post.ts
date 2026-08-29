import { createSupabaseStage01Routes } from '../../../../../../../features/stage01/stage01.routes'
import { runApiRoute } from '../../../../../../../utils/api-error'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseStage01Routes(event).returnForClarification(event)))
