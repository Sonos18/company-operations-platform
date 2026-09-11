import { createSupabaseBusinessPartyRoutes } from '../../../../features/business-parties/business-party.routes'
import { runApiRoute } from '../../../../utils/api-error'
export default defineEventHandler(event => runApiRoute(event, () => createSupabaseBusinessPartyRoutes(event).get()))
