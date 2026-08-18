import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmployeeRoutes } from '../../../server/features/employees/employee.routes'

const { getRouterParam, getQuery, readBody } = vi.hoisted(() => ({
  getRouterParam: vi.fn(),
  getQuery: vi.fn(),
  readBody: vi.fn(),
}))

vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(),
  getRouterParam,
  getQuery,
  readBody,
}))

const companyId = '10000000-0000-4000-8000-000000000020'
const employeeId = '10000000-0000-4000-8000-000000000101'
const context = {
  actorId: '10000000-0000-4000-8000-000000000001',
  tenantId: '10000000-0000-4000-8000-000000000010',
  companyId,
  permissions: ['employee.read_directory'] as never,
}

describe('employee route handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRouterParam.mockImplementation((_event, name: string) => ({ companyId, employeeId })[name])
  })

  it('parses pagination and passes the server-derived context to the list service', async () => {
    getQuery.mockReturnValue({ page: '2', pageSize: '50' })
    const resolveContext = vi.fn().mockResolvedValue(context)
    const list = vi.fn().mockResolvedValue({ items: [], page: 2, pageSize: 50, total: 0 })
    const routes = createEmployeeRoutes({ resolveContext, service: { list } as never })

    await expect(routes.list({} as never)).resolves.toEqual({
      items: [], page: 2, pageSize: 50, total: 0,
    })
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(list).toHaveBeenCalledWith(context, { page: 2, pageSize: 50 })
  })

  it('rejects malformed company and employee IDs before context resolution', async () => {
    getRouterParam.mockImplementation((_event, name: string) => ({ companyId: 'not-a-uuid', employeeId })[name])
    const resolveContext = vi.fn()
    const routes = createEmployeeRoutes({ resolveContext, service: {} as never })

    await expect(routes.detail({} as never)).rejects.toMatchObject({
      statusCode: 400,
      code: 'COMPANY_CONTEXT_REQUIRED',
    })
    expect(resolveContext).not.toHaveBeenCalled()
  })

  it('rejects update bodies that try to supply immutable scope or actor fields', async () => {
    readBody.mockResolvedValue({ fullName: 'Như Nguyễn', companyId, userId: context.actorId })
    const resolveContext = vi.fn()
    const update = vi.fn()
    const routes = createEmployeeRoutes({ resolveContext, service: { update } as never })

    await expect(routes.update({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveContext).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
