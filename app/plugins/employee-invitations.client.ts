import type { AuthenticatedHttpClient } from '../repositories/http/authenticated-http-client'
import type { CompanyAccessStore } from '../stores/company/company-access.store'
import { createHttpEmployeeInvitationRepository } from '../repositories/http/http-employee-invitation-repository'
export default defineNuxtPlugin({
  name: 'employee-invitations',
  dependsOn: ['auth-lifecycle'],
  async setup(nuxtApp) {
    await nuxtApp.$authReady
    return {
      provide: {
        employeeInvitations: createHttpEmployeeInvitationRepository({
          client: nuxtApp.$authenticatedHttpClient as AuthenticatedHttpClient,
          companyId: () => {
            const companyId = (nuxtApp.$companyAccessStore as CompanyAccessStore).activeCompanyId
            if (!companyId) throw new Error('ACTIVE_COMPANY_REQUIRED')
            return companyId
          },
        }),
      },
    }
  },
})
