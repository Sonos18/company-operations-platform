import { createSupabaseManualInvitationRoutes } from '../../../../features/employees/manual-invitation.routes'
import { runApiRoute } from '../../../../utils/api-error'
export default defineEventHandler(event => runApiRoute(event, () => createSupabaseManualInvitationRoutes(event).prepare(event)))
