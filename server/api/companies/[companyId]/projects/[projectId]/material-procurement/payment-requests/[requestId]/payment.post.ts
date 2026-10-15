import { createSupabaseMaterialPaymentRoutes } from '../../../../../../../../features/costs/material-finance/payment-routes'
import { runApiRoute } from '../../../../../../../../utils/api-error'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseMaterialPaymentRoutes(event).recordPayment(event)))
