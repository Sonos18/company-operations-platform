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

  it('injects the path project into direct RPC input while preserving absent and explicit empty source selections', async () => {
    const ids = { company: 'c1020000-0000-4000-8000-000000000020', project: 'c1020000-0000-4000-8000-000000000101', category: 'c1020000-0000-4000-8000-000000000301', detail: 'c1020000-0000-4000-8000-000000000401', key: 'c1020000-0000-4000-8000-000000000701' }
    const rpc = vi.fn().mockResolvedValue({ data: { id: ids.detail, projectCostItemId: ids.detail, publicationState: 'published', version: 0, replayed: false }, error: null })
    const repository = new ProjectCostRepository({ rpc } as never) as unknown as {
      createAndPublishDetail(context: { companyId: string, requestId: string }, projectId: string, input: { categoryId: string, description: string, amount: string, sourceFigureIds?: string[] }, idempotencyKey: string): Promise<unknown>
    }

    await repository.createAndPublishDetail({ companyId: ids.company, requestId: ids.key }, ids.project, { categoryId: ids.category, description: 'minimal', amount: '1.0000' }, ids.key)
    await repository.createAndPublishDetail({ companyId: ids.company, requestId: ids.key }, ids.project, { categoryId: ids.category, description: 'explicit empty', amount: '1.0000', sourceFigureIds: [] }, 'c1020000-0000-4000-8000-000000000702')

    expect(rpc).toHaveBeenNthCalledWith(1, 'c1_create_and_publish_project_cost_detail', expect.objectContaining({
      target_input: { projectId: ids.project, categoryId: ids.category, description: 'minimal', amount: '1.0000' },
    }))
    expect((rpc.mock.calls[0]![1] as { target_input: Record<string, unknown> }).target_input).not.toHaveProperty('sourceFigureIds')
    expect(rpc).toHaveBeenNthCalledWith(2, 'c1_create_and_publish_project_cost_detail', expect.objectContaining({
      target_input: { projectId: ids.project, categoryId: ids.category, description: 'explicit empty', amount: '1.0000', sourceFigureIds: [] },
    }))
  })
})
