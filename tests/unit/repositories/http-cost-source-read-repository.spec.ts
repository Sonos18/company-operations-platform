import { describe, expect, it, vi } from 'vitest'
import { createHttpCostSourceReadRepository } from '../../../app/repositories/http/http-cost-source-read-repository'

const companyId = 'c1000000-0000-4000-8000-000000000020'
const projectId = 'c1000000-0000-4000-8000-000000000030'

describe('cost source HTTP repository', () => {
  it('uses a company-scoped GET path and bounded project figure filters', async () => {
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse({ items: [], nextCursor: null }))
    const repository = createHttpCostSourceReadRepository({ companyId: () => companyId, client: { request } as never })

    await repository.figures(projectId, { limit: 25, mappingState: 'pending', search: 'source' })

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: `/api/companies/${companyId}/cost-sources/projects/${projectId}/figures?limit=25&mappingState=pending&search=source`,
    }))
  })
})
