import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoleSummary } from '../../../shared/schemas/rbac'
import { AppApiError } from '../../../server/utils/api-error'
import {
  createRoleLifecycleService,
  type RoleLifecycleRepository,
} from '../../../server/features/rbac/rbac.service'
import { createRoleLifecycleRoutes } from '../../../server/features/rbac/rbac.routes'
import { createSupabaseRoleLifecycleRepository } from '../../../server/features/rbac/rbac.repository'

const { getRouterParam, readBody } = vi.hoisted(() => ({
  getRouterParam: vi.fn(),
  readBody: vi.fn(),
}))

vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(),
  getRouterParam,
  readBody,
}))

const companyId = '10000000-0000-4000-8000-000000000020'
const actorId = '10000000-0000-4000-8000-000000000001'
const nhuUserId = '10000000-0000-4000-8000-000000000002'
const newEmployeeUserId = '10000000-0000-4000-8000-000000000003'
const roleId = '10000000-0000-4000-8000-000000000301'

const supplierSourcingRole: RoleSummary = {
  id: roleId,
  code: 'supplier_sourcing',
  name: 'Thu mua',
  description: 'Supplier sourcing access',
  isPrivileged: false,
  isSystem: true,
  permissions: ['supplier.create', 'supplier.read'],
}

function context(permissions: string[]) {
  return {
    actorId,
    tenantId: '10000000-0000-4000-8000-000000000010',
    companyId,
    permissions: permissions as never,
  }
}

function repository(overrides: Partial<RoleLifecycleRepository> = {}): RoleLifecycleRepository {
  return {
    listActiveRoles: vi.fn().mockResolvedValue([supplierSourcingRole]),
    grantRole: vi.fn().mockResolvedValue({ id: 1, targetUserId: newEmployeeUserId, roleId }),
    revokeRole: vi.fn().mockResolvedValue({ id: 1, targetUserId: nhuUserId, roleId }),
    ...overrides,
  }
}

describe('role lifecycle service', () => {
  it('denies role catalog reads before querying the role repository', async () => {
    const roleRepository = repository()

    await expect(createRoleLifecycleService(roleRepository).list(context([])))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(roleRepository.listActiveRoles).not.toHaveBeenCalled()
  })

  it('lists only validated active company roles and permissions after role.read', async () => {
    const roleRepository = repository()

    await expect(createRoleLifecycleService(roleRepository).list(context(['role.read'])))
      .resolves.toEqual([supplierSourcingRole])
    expect(roleRepository.listActiveRoles).toHaveBeenCalledWith(companyId)
  })

  it.each([
    ['role.assign', 'grant'],
    ['role.revoke', 'revoke'],
  ] as const)('requires %s before the %s RPC boundary', async (permission, operation) => {
    const roleRepository = repository()
    const service = createRoleLifecycleService(roleRepository)

    const action = operation === 'grant'
      ? service.grant(context([]), { targetUserId: newEmployeeUserId, roleId, reason: 'Transfer workflow' })
      : service.revoke(context([]), 1, { reason: 'Transfer workflow' })

    await expect(action).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(roleRepository.grantRole).not.toHaveBeenCalled()
    expect(roleRepository.revokeRole).not.toHaveBeenCalled()
  })

  it('preserves database conflict codes instead of rebuilding role-assignment invariants in TypeScript', async () => {
    const conflict = new AppApiError(409, 'ROLE_ASSIGNMENT_CONFLICT', 'Vai trò đang hoạt động.')
    const roleRepository = repository({ grantRole: vi.fn().mockRejectedValue(conflict) })

    await expect(createRoleLifecycleService(roleRepository).grant(
      context(['role.assign']),
      { targetUserId: newEmployeeUserId, roleId, reason: 'Transfer workflow' },
    )).rejects.toBe(conflict)
  })

  it('transfers the supplier role to a new active employee before revoking it from Như', async () => {
    const activeAssignments = new Map<string, number>([[nhuUserId, 7]])
    const roleRepository = repository({
      grantRole: vi.fn(async (_companyId, input) => {
        activeAssignments.set(input.targetUserId, 8)
        return { id: 8, targetUserId: input.targetUserId, roleId: input.roleId }
      }),
      revokeRole: vi.fn(async assignmentId => {
        expect(assignmentId).toBe(7)
        activeAssignments.delete(nhuUserId)
        return { id: assignmentId, targetUserId: nhuUserId, roleId }
      }),
    })
    const service = createRoleLifecycleService(roleRepository)

    await service.grant(
      context(['role.assign', 'role.revoke']),
      { targetUserId: newEmployeeUserId, roleId, reason: 'Transfer supplier sourcing' },
    )
    await service.revoke(
      context(['role.assign', 'role.revoke']),
      7,
      { reason: 'Transferred to new employee' },
    )

    expect(activeAssignments).toEqual(new Map([[newEmployeeUserId, 8]]))
  })
})

describe('role lifecycle route handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRouterParam.mockImplementation((_event, name: string) => ({ companyId, assignmentId: '7' })[name])
  })

  it('resolves company context before parsing a strict grant body without caller scope', async () => {
    readBody.mockResolvedValue({
      targetUserId: newEmployeeUserId,
      roleId,
      reason: 'Transfer supplier sourcing',
    })
    const resolveContext = vi.fn().mockResolvedValue(context(['role.assign']))
    const grant = vi.fn().mockResolvedValue({ id: 8, targetUserId: newEmployeeUserId, roleId })
    const routes = createRoleLifecycleRoutes({ resolveContext, service: { grant } as never })

    await expect(routes.grant({} as never)).resolves.toEqual({ id: 8, targetUserId: newEmployeeUserId, roleId })
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(readBody.mock.invocationCallOrder[0]).toBeGreaterThan(resolveContext.mock.invocationCallOrder[0]!)
    expect(grant).toHaveBeenCalledWith(context(['role.assign']), {
      targetUserId: newEmployeeUserId,
      roleId,
      reason: 'Transfer supplier sourcing',
    })
  })

  it('rejects grant bodies that try to supply actor or company context', async () => {
    readBody.mockResolvedValue({
      targetUserId: newEmployeeUserId,
      roleId,
      reason: 'Transfer supplier sourcing',
      actorId,
      companyId,
    })
    const resolveContext = vi.fn().mockResolvedValue(context(['role.assign']))
    const grant = vi.fn()
    const routes = createRoleLifecycleRoutes({ resolveContext, service: { grant } as never })

    await expect(routes.grant({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(grant).not.toHaveBeenCalled()
  })

  it('parses a positive assignment ID and strict revoke reason in server-derived company context', async () => {
    readBody.mockResolvedValue({ reason: 'Transferred to new employee' })
    const resolveContext = vi.fn().mockResolvedValue(context(['role.revoke']))
    const revoke = vi.fn().mockResolvedValue({ id: 7, targetUserId: nhuUserId, roleId })
    const routes = createRoleLifecycleRoutes({ resolveContext, service: { revoke } as never })

    await expect(routes.revoke({} as never)).resolves.toEqual({ id: 7, targetUserId: nhuUserId, roleId })
    expect(revoke).toHaveBeenCalledWith(context(['role.revoke']), 7, {
      reason: 'Transferred to new employee',
    })
  })
})

function roleQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: (resolve: (value: { data: unknown, error: unknown }) => unknown) => resolve({ data, error }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.order.mockReturnValue(query)
  return query
}

describe('Supabase role lifecycle repository', () => {
  it('reads active company roles and validates their normalized permissions', async () => {
    const query = roleQuery([{
      id: roleId,
      code: 'supplier_sourcing',
      name: 'Thu mua',
      description: 'Supplier sourcing access',
      is_privileged: false,
      is_system: true,
      role_permissions: [{ permission_code: 'supplier.create' }, { permission_code: 'supplier.read' }],
    }])
    const from = vi.fn().mockReturnValue(query)
    const repository = createSupabaseRoleLifecycleRepository({ from, rpc: vi.fn() } as never)

    await expect(repository.listActiveRoles(companyId)).resolves.toEqual([supplierSourcingRole])
    expect(from).toHaveBeenCalledWith('roles')
    expect(query.eq).toHaveBeenNthCalledWith(1, 'company_id', companyId)
    expect(query.eq).toHaveBeenNthCalledWith(2, 'is_active', true)
  })

  it('maps duplicate-active-role database failures to ROLE_ASSIGNMENT_CONFLICT', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'ROLE_ASSIGNMENT_CONFLICT' },
    })
    const repository = createSupabaseRoleLifecycleRepository({ from: vi.fn(), rpc } as never)

    await expect(repository.grantRole(companyId, {
      targetUserId: newEmployeeUserId,
      roleId,
      reason: 'Transfer supplier sourcing',
    })).rejects.toMatchObject({ statusCode: 409, code: 'ROLE_ASSIGNMENT_CONFLICT' })
  })

  it('maps target scope failures to the non-enumerating permission denial', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'ONBOARDING_INCOMPLETE' },
    })
    const repository = createSupabaseRoleLifecycleRepository({ from: vi.fn(), rpc } as never)

    await expect(repository.revokeRole(7, { reason: 'Transfer supplier sourcing' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
  })
})
