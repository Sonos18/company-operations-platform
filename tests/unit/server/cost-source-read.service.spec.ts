import { describe, expect, it, vi } from 'vitest'
import { createCostSourceReadService } from '../../../server/features/costs/source-read.service'

const context = {
  actorId: 'c1000000-0000-4000-8000-000000000001', tenantId: 'c1000000-0000-4000-8000-000000000002',
  companyId: 'c1000000-0000-4000-8000-000000000003', requestId: 'request-1', permissions: ['cost.source.read', 'cost.prepare'] as const,
}

describe('cost source read service', () => {
  it('requires the same read and prepare capabilities as the persisted RLS policy', async () => {
    const overview = vi.fn()
    const service = createCostSourceReadService({ probe: vi.fn(), overview } as never)

    await expect(service.overview({ ...context, permissions: ['cost.source.read'] })).rejects.toMatchObject({
      statusCode: 403, code: 'PERMISSION_DENIED',
    })
    expect(overview).not.toHaveBeenCalled()
  })

  it('rejects oversized figure pages before the data repository is called', async () => {
    const figures = vi.fn()
    const service = createCostSourceReadService({ probe: vi.fn(), figures } as never)

    await expect(service.figures(context, { page: '1', pageSize: '101' })).rejects.toMatchObject({
      statusCode: 400, code: 'INPUT_INVALID',
    })
    expect(figures).not.toHaveBeenCalled()
  })
})
