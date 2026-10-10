import { analyzeMaterialQuotation } from '../../../../../../../../features/costs/material-procurement/quotation-analysis'

export default defineEventHandler(event => runApiRoute(event, () => analyzeMaterialQuotation(event)))
