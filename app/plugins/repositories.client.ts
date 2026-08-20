import { PROTOTYPE_CONFIG } from '../config/prototype'
import type { RepositoryRegistry } from '../repositories/contracts'
import { createMockRepositories } from '../repositories/mock/mock-repositories'
import { BrowserStateStore } from '../repositories/mock/state-store'

export default defineNuxtPlugin(() => {
  const context = {
    tenantId: PROTOTYPE_CONFIG.initialTenantId,
    companyId: PROTOTYPE_CONFIG.initialCompanyId,
  }
  const repositories: RepositoryRegistry = createMockRepositories(new BrowserStateStore(), context)

  return {
    provide: { repositories },
  }
})
