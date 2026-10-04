import { employeeInvitationInputSchema } from '../../../shared/schemas/employees'
import type { EmployeeInvitationInput } from '../../../shared/schemas/employees'
import { employeeInvitationOptionsSchema, preparedEmployeeInvitationSchema } from '../../../shared/schemas/employee-invitations'
import type { AuthenticatedHttpClient } from './authenticated-http-client'
export function createHttpEmployeeInvitationRepository(options: { companyId: () => string; client: AuthenticatedHttpClient }) {
  const base = () => '/api/companies/' + encodeURIComponent(options.companyId()) + '/employee-invitations'
  return {
    options: () => options.client.request({ url: base() + '/options', schema: employeeInvitationOptionsSchema }),
    prepare: (input: EmployeeInvitationInput) => options.client.request({
      url: base() + '/manual', method: 'POST', body: employeeInvitationInputSchema.parse(input), schema: preparedEmployeeInvitationSchema,
    }),
  }
}
