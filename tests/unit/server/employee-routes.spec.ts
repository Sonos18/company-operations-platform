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

  it('rejects terminal employment status in the generic employee PATCH route', async () => {
    readBody.mockResolvedValue({ employmentStatus: 'terminated' })
    const resolveContext = vi.fn()
    const update = vi.fn()
    const routes = createEmployeeRoutes({ resolveContext, service: { update } as never })

    await expect(routes.update({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveContext).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('accepts only the invitation schema and passes the server-derived company context', async () => {
    readBody.mockResolvedValue({
      employeeCode: 'VQH-NEW',
      fullName: 'Nguyễn Mới',
      workEmail: ' NEW@VQH.LOCAL ',
      departmentId: '10000000-0000-4000-8000-000000000201',
    })
    const resolveContext = vi.fn().mockResolvedValue(context)
    const authorizeInvitation = vi.fn().mockResolvedValue(undefined)
    const invite = vi.fn().mockResolvedValue({ id: employeeId })
    const routes = createEmployeeRoutes({
      resolveContext,
      service: { authorizeInvitation, invite } as never,
    }) as unknown as {
      invite(event: unknown): Promise<unknown>
    }

    await expect(routes.invite({})).resolves.toEqual({ id: employeeId })
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(authorizeInvitation).toHaveBeenCalledWith(context)
    expect(readBody.mock.invocationCallOrder[0]).toBeGreaterThan(authorizeInvitation.mock.invocationCallOrder[0]!)
    expect(invite).toHaveBeenCalledWith(context, {
      employeeCode: 'VQH-NEW',
      fullName: 'Nguyễn Mới',
      workEmail: 'new@vqh.local',
      departmentId: '10000000-0000-4000-8000-000000000201',
    })
  })

  it('rejects client-supplied invitation actor, scope, or role fields after authorization', async () => {
    readBody.mockResolvedValue({
      employeeCode: 'VQH-NEW',
      fullName: 'Nguyễn Mới',
      workEmail: 'new@vqh.local',
      departmentId: '10000000-0000-4000-8000-000000000201',
      actorId: context.actorId,
      companyId,
      userId: '10000000-0000-4000-8000-000000000002',
      roles: ['company_admin'],
    })
    const resolveContext = vi.fn().mockResolvedValue(context)
    const authorizeInvitation = vi.fn().mockResolvedValue(undefined)
    const invite = vi.fn()
    const routes = createEmployeeRoutes({
      resolveContext,
      service: { authorizeInvitation, invite } as never,
    }) as unknown as {
      invite(event: unknown): Promise<unknown>
    }

    await expect(routes.invite({})).rejects.toMatchObject({ statusCode: 400 })
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(authorizeInvitation).toHaveBeenCalledWith(context)
    expect(invite).not.toHaveBeenCalled()
  })

  it('denies an unauthorized invitation before reading its body or initializing Auth administration', async () => {
    readBody.mockResolvedValue({ employeeCode: 'malformed body that must not be read' })
    const resolveContext = vi.fn().mockResolvedValue(context)
    const authorizeInvitation = vi.fn().mockRejectedValue({
      statusCode: 403,
      code: 'PERMISSION_DENIED',
    })
    const invite = vi.fn()
    const routes = createEmployeeRoutes({
      resolveContext,
      service: { authorizeInvitation, invite } as never,
    }) as unknown as {
      invite(event: unknown): Promise<unknown>
    }

    await expect(routes.invite({})).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(authorizeInvitation).toHaveBeenCalledWith(context)
    expect(readBody).not.toHaveBeenCalled()
    expect(invite).not.toHaveBeenCalled()
  })
})
