import { createSupabaseProjectFinanceWriteRoutes } from '../../../../../../../../../features/costs/finance/project-finance-write.routes'
import { runApiRoute } from '../../../../../../../../../utils/api-error'
export default defineEventHandler(event=>runApiRoute(event,()=>createSupabaseProjectFinanceWriteRoutes(event).voidPayment(event)))
