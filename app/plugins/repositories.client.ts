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
import { createHttpCostSourceReadRepository } from '../repositories/http/http-cost-source-read-repository'
import { createHttpProjectCostRepository } from '../repositories/http/http-project-cost-repository'
import { createHttpCostEvidenceRepository } from '../repositories/http/http-cost-evidence-repository'
import { createHttpProjectFinanceRepository } from '../repositories/http/http-project-finance-repository'
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
    const financeCompanyId = () => {
      if (!companyAccess.activeCompanyId) throw new Error('ACTIVE_COMPANY_REQUIRED')
      return companyAccess.activeCompanyId
    }
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
      costSourceRead: createHttpCostSourceReadRepository({ companyId: () => companyAccess.activeCompanyId ?? context.companyId, client }),
      projectCosts: createHttpProjectCostRepository({ companyId: () => companyAccess.activeCompanyId ?? context.companyId, client }),
      costEvidence: createHttpCostEvidenceRepository({ companyId: () => companyAccess.activeCompanyId ?? context.companyId, client }),
      projectFinance: createHttpProjectFinanceRepository({ companyId: financeCompanyId, client }),
    }

    return { provide: { repositories } }
  },
})
