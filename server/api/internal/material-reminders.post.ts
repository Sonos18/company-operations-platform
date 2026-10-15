import { runMaterialReminders } from '../../features/costs/material-finance/reminders'
import { runApiRoute } from '../../utils/api-error'
export default defineEventHandler(event => runApiRoute(event, () => runMaterialReminders(event)))
