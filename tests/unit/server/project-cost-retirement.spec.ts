import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProjectCostRoutes } from '../../../server/features/costs/project-cost.routes'

const retiredPaths = [
  'projects/[projectId]/project-costs/index.post.ts',
  'project-costs/[projectCostItemId].patch.ts',
  'project-costs/[projectCostItemId]/financials.put.ts',
  'project-costs/[projectCostItemId]/draft.get.ts',
  'projects/[projectId]/project-cost-drafts.get.ts',
  'project-costs/[projectCostItemId]/draft/operations.get.ts',
  'projects/[projectId]/project-cost-drafts/operations.get.ts',
  'project-costs/[projectCostItemId]/publish.post.ts',
]

describe('legacy parent draft retirement', () => {
  it('has no HTTP handlers for the parent draft lifecycle', () => {
    for (const path of retiredPaths) {
      expect(existsSync(resolve('server/api/companies/[companyId]', path)), path).toBe(false)
    }
  })

  it('keeps published parent correction and ordinary detail routes without parent draft handlers', () => {
    const routes = createProjectCostRoutes({ resolveContext: async () => ({}) as never })
    for (const name of ['create', 'patch', 'financials', 'draft', 'drafts', 'operationalDraft', 'operationalDrafts', 'publish']) {
      expect(routes).not.toHaveProperty(name)
    }
    for (const name of ['correction', 'draftManagementMetadata', 'createDetailDraft', 'prepareDetailFinancials', 'publishDetail', 'correctPublishedDetail']) {
      expect(routes).toHaveProperty(name, expect.any(Function))
    }
  })
})
