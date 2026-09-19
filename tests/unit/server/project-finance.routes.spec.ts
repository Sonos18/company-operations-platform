import { describe, expect, it, vi } from 'vitest'
import { createProjectFinanceRoutes } from '../../../server/features/costs/finance/project-finance.routes'

const ids = { companyId: 'c1060000-0000-4000-8000-000000000020', projectId: 'c1060000-0000-4000-8000-000000000030', partyId: 'c1060000-0000-4000-8000-000000000040', itemId: 'c1060000-0000-4000-8000-000000000050', contractId: 'c1060000-0000-4000-8000-000000000060' }

const { getQuery, getRouterParam } = vi.hoisted(() => ({ getQuery: vi.fn(), getRouterParam: vi.fn() }))
vi.mock('h3', async importOriginal => ({ ...await importOriginal<typeof import('h3')>(), getQuery, getRouterParam }))

describe('Project Finance routes', () => {
  it('keeps each endpoint behind the context and service boundary', async () => {
    getRouterParam.mockImplementation((_event: unknown, name: string) => ({ companyId: ids.companyId, projectId: ids.projectId, partyId: ids.partyId, projectCostItemId: ids.itemId, subcontractId: ids.contractId }[name]))
    getQuery.mockReturnValue({})
    const resolveContext = vi.fn().mockResolvedValue({ tenantId: 'c1060000-0000-4000-8000-000000000010', companyId: ids.companyId, permissions: ['cost.read'] })
    const service = {
      listProjects: vi.fn().mockResolvedValue({ ok: 'list' }), overview: vi.fn().mockResolvedValue({ ok: 'overview' }), budget: vi.fn().mockResolvedValue({ ok: 'budget' }), ownerAdvances: vi.fn().mockResolvedValue({ ok: 'advances' }), subcontractors: vi.fn().mockResolvedValue({ ok: 'subcontractors' }), subcontractor: vi.fn().mockResolvedValue({ ok: 'party' }), subcontract: vi.fn().mockResolvedValue({ ok: 'contract' }), itemDetails: vi.fn().mockResolvedValue({ ok: 'details' }),
    }
    const routes = createProjectFinanceRoutes({ resolveContext, service: service as never })

    await expect(routes.listProjects({} as never)).resolves.toEqual({ ok: 'list' })
    await expect(routes.overview({} as never)).resolves.toEqual({ ok: 'overview' })
    await expect(routes.budget({} as never)).resolves.toEqual({ ok: 'budget' })
    await expect(routes.ownerAdvances({} as never)).resolves.toEqual({ ok: 'advances' })
    await expect(routes.subcontractors({} as never)).resolves.toEqual({ ok: 'subcontractors' })
    await expect(routes.subcontractor({} as never)).resolves.toEqual({ ok: 'party' })
    await expect(routes.subcontract({} as never)).resolves.toEqual({ ok: 'contract' })
    await expect(routes.itemDetails({} as never)).resolves.toEqual({ ok: 'details' })
    expect(resolveContext).toHaveBeenCalledTimes(8)
  })

  it('rejects invalid and duplicate query values before invoking the service', async () => {
    getRouterParam.mockImplementation((_event: unknown, name: string) => name === 'companyId' ? ids.companyId : ids.projectId)
    getQuery.mockReturnValue({ pageSize: ['25', '50'] })
    const service = { ownerAdvances: vi.fn() }
    const routes = createProjectFinanceRoutes({ resolveContext: vi.fn().mockResolvedValue({ tenantId: 'c1060000-0000-4000-8000-000000000010', companyId: ids.companyId, permissions: ['cost.read'], db: {} }), service: service as never })

    await expect(routes.ownerAdvances({} as never)).rejects.toMatchObject({ statusCode: 400, code: 'INPUT_INVALID' })
    expect(service.ownerAdvances).not.toHaveBeenCalled()
  })
})
