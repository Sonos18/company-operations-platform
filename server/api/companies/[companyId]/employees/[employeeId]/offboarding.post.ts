import { createSupabaseEmployeeRoutes } from '../../../../../features/employees/employee.routes'
import { runApiRoute } from '../../../../../utils/api-error'

export default defineEventHandler(event => runApiRoute(event, () => (
  createSupabaseEmployeeRoutes(event).offboard(event)
)))
