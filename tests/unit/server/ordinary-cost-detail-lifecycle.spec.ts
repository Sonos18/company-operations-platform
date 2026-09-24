import { describe, expect, it, vi } from 'vitest'
import { ProjectCostRepository } from '../../../server/features/costs/project-cost.repository'
import { ProjectCostService } from '../../../server/features/costs/project-cost.service'
import { createProjectCostRoutes } from '../../../server/features/costs/project-cost.routes'

describe('ordinary cost detail lifecycle server boundary', () => {
  it('exposes separate detail commands without repurposing the deprecated parent commands', () => {
    const repository = new ProjectCostRepository({ rpc: vi.fn() } as never) as unknown as Record<string, unknown>
    const service = new ProjectCostService({} as never) as unknown as Record<string, unknown>
    const routes = createProjectCostRoutes({ resolveContext: vi.fn() as never }) as unknown as Record<string, unknown>

    for (const name of ['createDetailDraft', 'updateDetailDraft', 'prepareDetailFinancials', 'detailDraft', 'listDetailDrafts', 'operationalDetailDraft', 'listOperationalDetailDrafts', 'publishDetail', 'createAndPublishDetail', 'correctPublishedDetail']) {
      expect(repository[name]).toEqual(expect.any(Function))
      expect(service[name]).toEqual(expect.any(Function))
      expect(routes[name]).toEqual(expect.any(Function))
    }
  })
})
