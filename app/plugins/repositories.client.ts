import { PROTOTYPE_CONFIG } from '../config/prototype'
import type { RepositoryRegistry } from '../repositories/contracts'
import { createMockRepositories } from '../repositories/mock/mock-repositories'
import { BrowserStateStore } from '../repositories/mock/state-store'
import { createHttpOpportunityRepository } from '../repositories/http/http-opportunity-repository'
import { createHttpWorkflowRepository } from '../repositories/http/http-workflow-repository'
import { createHttpStage01Repository } from '../repositories/http/http-stage01-repository'
import type { AuthenticatedHttpClient } from '../repositories/http/authenticated-http-client'
import type { CompanyAccessStore } from '../stores/company/company-access.store'

export default defineNuxtPlugin({
  name: 'repositories',
  enforce: 'post',
  dependsOn: ['auth-lifecycle'],
  async setup(nuxtApp) {
    await nuxtApp.$authReady
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
    }

    return { provide: { repositories } }
  },
})
