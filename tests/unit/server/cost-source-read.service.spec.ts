import { describe, expect, it, vi } from 'vitest'
import { createCostSourceReadService } from '../../../server/features/costs/source-read.service'

const context = {
  actorId: 'c1000000-0000-4000-8000-000000000001', tenantId: 'c1000000-0000-4000-8000-000000000002',
  companyId: 'c1000000-0000-4000-8000-000000000003', requestId: 'request-1', permissions: ['cost.source.read', 'cost.prepare'] as const,
}

describe('cost source read service', () => {
  it('allows every source-read operation with cost.source.read alone', async () => {
    const probe = vi.fn()
    const figures = vi.fn().mockResolvedValue([])
    const provenance = vi.fn().mockResolvedValue(null)
    const service = createCostSourceReadService({ probe, figures, provenance } as never)

    await expect(service.overview({ ...context, permissions: ['cost.source.read'] })).resolves.toMatchObject({ figureCount: 0 })
    await expect(service.project({ ...context, permissions: ['cost.source.read'] }, 'c1000000-0000-4000-8000-000000000004')).resolves.toMatchObject({ project: null })
    await expect(service.figures({ ...context, permissions: ['cost.source.read'] }, { limit: 1 })).resolves.toEqual({ items: [], nextCursor: null })
    await expect(service.provenance({ ...context, permissions: ['cost.source.read'] }, 'c1000000-0000-4000-8000-000000000004')).rejects.toMatchObject({ statusCode: 404 })
    expect(probe).toHaveBeenCalledTimes(4)
    expect(figures).toHaveBeenCalledTimes(3)
    expect(provenance).toHaveBeenCalledTimes(1)
  })

  it('denies source-read operations without cost.source.read while retaining preparer support', async () => {
    const probe = vi.fn()
    const figures = vi.fn().mockResolvedValue([])
    const service = createCostSourceReadService({ probe, figures } as never)

    await expect(service.overview({ ...context, permissions: ['cost.prepare'] })).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    await expect(service.overview(context)).resolves.toMatchObject({ figureCount: 0 })
    expect(probe).toHaveBeenCalledTimes(1)
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
