import { PROTOTYPE_CONFIG } from '../config/prototype'
import type { RepositoryRegistry } from '../repositories/contracts'
import { createMockRepositories } from '../repositories/mock/mock-repositories'
import { BrowserStateStore } from '../repositories/mock/state-store'
import { createHttpOpportunityRepository } from '../repositories/http/http-opportunity-repository'
import { createHttpWorkflowRepository } from '../repositories/http/http-workflow-repository'
import { createHttpStage01Repository } from '../repositories/http/http-stage01-repository'
import { createHttpStage01ConfigRepository } from '../repositories/http/http-stage01-config-repository'
import { createHttpEmployeeRepository } from '../repositories/http/http-employee-repository'
import { createHttpProjectRegisterRepository } from '../repositories/http/http-project-register-repository'
import { createHttpBusinessPartyRepository } from '../repositories/http/http-business-party-repository'
import { createHttpEngagementRepository } from '../repositories/http/http-engagement-repository'
import { createHttpCostSettingsRepository } from '../repositories/http/http-cost-settings-repository'
import type { SupabaseAuthRepository } from '../repositories/auth/supabase-auth.repository'
import type { AuthenticatedHttpClient } from '../repositories/http/authenticated-http-client'
import type { CompanyAccessStore } from '../stores/company/company-access.store'

export default defineNuxtPlugin({
  name: 'repositories',
  enforce: 'post',
  dependsOn: ['auth-lifecycle'],
  async setup(nuxtApp) {
    await nuxtApp.$authReady
    const authRepository = nuxtApp.$authRepository as SupabaseAuthRepository
    const context = {
      tenantId: PROTOTYPE_CONFIG.initialTenantId,
      companyId: PROTOTYPE_CONFIG.initialCompanyId,
    }
    const companyAccess = nuxtApp.$companyAccessStore as CompanyAccessStore
    const companyId = companyAccess.activeCompanyId ?? context.companyId
    const client = nuxtApp.$authenticatedHttpClient as AuthenticatedHttpClient
    const repositories: RepositoryRegistry = {
      ...createMockRepositories(new BrowserStateStore(), context),
      opportunities: createHttpOpportunityRepository({ companyId, client }),
      workflow: createHttpWorkflowRepository({ companyId, client }),
      stage01: createHttpStage01Repository({ companyId, client }),
      stage01Config: createHttpStage01ConfigRepository({ companyId, client }),
      employees: createHttpEmployeeRepository({
        companyId: () => companyAccess.activeCompanyId ?? context.companyId,
        getAccessToken: () => authRepository.getAccessToken(),
        fetch: globalThis.fetch.bind(globalThis),
      }),
      projectRegister: createHttpProjectRegisterRepository({ companyId: () => companyAccess.activeCompanyId ?? context.companyId, client }),
      businessParties: createHttpBusinessPartyRepository({ companyId: () => companyAccess.activeCompanyId ?? context.companyId, client }),
      engagements: createHttpEngagementRepository({ companyId: () => companyAccess.activeCompanyId ?? context.companyId, client }),
      costSettings: createHttpCostSettingsRepository({ companyId: () => companyAccess.activeCompanyId ?? context.companyId, client }),
    }

    return { provide: { repositories } }
  },
})
