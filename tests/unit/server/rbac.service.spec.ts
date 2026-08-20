import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoleSummary } from '../../../shared/schemas/rbac'
import { AppApiError } from '../../../server/utils/api-error'
import {
  createRoleLifecycleService,
  type RoleLifecycleRepository,
} from '../../../server/features/rbac/rbac.service'
import { createRoleLifecycleRoutes } from '../../../server/features/rbac/rbac.routes'
import { createSupabaseRoleLifecycleRepository } from '../../../server/features/rbac/rbac.repository'

const { getQuery, getRouterParam, readBody } = vi.hoisted(() => ({
  getQuery: vi.fn(),
  getRouterParam: vi.fn(),
  readBody: vi.fn(),
}))

vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(),
  getQuery,
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
    listActiveAssignments: vi.fn().mockResolvedValue([]),
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

  it('denies active assignment listing before querying the repository', async () => {
    const listActiveAssignments = vi.fn()
    const roleRepository = repository({ listActiveAssignments } as never)

    await expect(createRoleLifecycleService(roleRepository).listAssignments(context([]), {}))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(listActiveAssignments).not.toHaveBeenCalled()
  })

  it('lists active assignment summaries scoped by company and optional target user after role.read', async () => {
    const summary = { id: 7, targetUserId: nhuUserId, roleId }
    const listActiveAssignments = vi.fn().mockResolvedValue([summary])
    const roleRepository = repository({ listActiveAssignments } as never)

    await expect(createRoleLifecycleService(roleRepository).listAssignments(
      context(['role.read']),
      { targetUserId: nhuUserId },
    )).resolves.toEqual([summary])
    expect(listActiveAssignments).toHaveBeenCalledWith(companyId, nhuUserId)
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

  it.each([
    ['authorizeGrant', 'role.assign'],
    ['authorizeRevoke', 'role.revoke'],
  ] as const)('exposes %s as a direct permission-first guard for %s', async (method, permission) => {
    const roleRepository = repository()
    const service = createRoleLifecycleService(roleRepository)

    await expect(service[method](context([]))).rejects.toMatchObject({
      statusCode: 403,
      code: 'PERMISSION_DENIED',
    })
    await expect(service[method](context([permission]))).resolves.toBeUndefined()
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
      revokeRole: vi.fn(async (scopedCompanyId, assignmentId) => {
        expect(scopedCompanyId).toBe(companyId)
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
    getQuery.mockReturnValue({})
  })

  it('resolves company context before parsing a strict grant body without caller scope', async () => {
    readBody.mockResolvedValue({
      targetUserId: newEmployeeUserId,
      roleId,
      reason: 'Transfer supplier sourcing',
    })
    const resolveContext = vi.fn().mockResolvedValue(context(['role.assign']))
    const grant = vi.fn().mockResolvedValue({ id: 8, targetUserId: newEmployeeUserId, roleId })
    const authorizeGrant = vi.fn().mockResolvedValue(undefined)
    const routes = createRoleLifecycleRoutes({ resolveContext, service: { authorizeGrant, grant } as never })

    await expect(routes.grant({} as never)).resolves.toEqual({ id: 8, targetUserId: newEmployeeUserId, roleId })
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(authorizeGrant).toHaveBeenCalledWith(context(['role.assign']))
    expect(readBody.mock.invocationCallOrder[0]).toBeGreaterThan(authorizeGrant.mock.invocationCallOrder[0]!)
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
    const authorizeGrant = vi.fn().mockResolvedValue(undefined)
    const routes = createRoleLifecycleRoutes({ resolveContext, service: { authorizeGrant, grant } as never })

    await expect(routes.grant({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(grant).not.toHaveBeenCalled()
  })

  it('parses a positive assignment ID and strict revoke reason in server-derived company context', async () => {
    readBody.mockResolvedValue({ reason: 'Transferred to new employee' })
    const resolveContext = vi.fn().mockResolvedValue(context(['role.revoke']))
    const revoke = vi.fn().mockResolvedValue({ id: 7, targetUserId: nhuUserId, roleId })
    const authorizeRevoke = vi.fn().mockResolvedValue(undefined)
    const routes = createRoleLifecycleRoutes({ resolveContext, service: { authorizeRevoke, revoke } as never })

    await expect(routes.revoke({} as never)).resolves.toEqual({ id: 7, targetUserId: nhuUserId, roleId })
    expect(authorizeRevoke).toHaveBeenCalledWith(context(['role.revoke']))
    expect(readBody.mock.invocationCallOrder[0]).toBeGreaterThan(authorizeRevoke.mock.invocationCallOrder[0]!)
    expect(revoke).toHaveBeenCalledWith(context(['role.revoke']), 7, {
      reason: 'Transferred to new employee',
    })
  })

  it('authorizes assignment listing before parsing the optional target-user filter', async () => {
    getQuery.mockReturnValue({ targetUserId: nhuUserId })
    const resolveContext = vi.fn().mockResolvedValue(context(['role.read']))
    const authorizeListAssignments = vi.fn().mockResolvedValue(undefined)
    const listAssignments = vi.fn().mockResolvedValue([{ id: 7, targetUserId: nhuUserId, roleId }])
    const routes = createRoleLifecycleRoutes({
      resolveContext,
      service: { authorizeListAssignments, listAssignments } as never,
    })

    await expect(routes.listAssignments({})).resolves.toEqual([{ id: 7, targetUserId: nhuUserId, roleId }])
    expect(authorizeListAssignments).toHaveBeenCalledWith(context(['role.read']))
    expect(getQuery.mock.invocationCallOrder[0]).toBeGreaterThan(authorizeListAssignments.mock.invocationCallOrder[0]!)
    expect(listAssignments).toHaveBeenCalledWith(context(['role.read']), { targetUserId: nhuUserId })
  })

  it('denies assignment listing before reading query filters', async () => {
    getQuery.mockReturnValue({ targetUserId: 'not-a-uuid' })
    const resolveContext = vi.fn().mockResolvedValue(context([]))
    const authorizeListAssignments = vi.fn().mockRejectedValue(new AppApiError(403, 'PERMISSION_DENIED', 'Denied'))
    const listAssignments = vi.fn()
    const routes = createRoleLifecycleRoutes({
      resolveContext,
      service: { authorizeListAssignments, listAssignments } as never,
    })

    await expect(routes.listAssignments({})).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(getQuery).not.toHaveBeenCalled()
    expect(listAssignments).not.toHaveBeenCalled()
  })

  it('rejects malformed assignment-list query filters after authorization', async () => {
    getQuery.mockReturnValue({ targetUserId: 'not-a-uuid' })
    const resolveContext = vi.fn().mockResolvedValue(context(['role.read']))
    const authorizeListAssignments = vi.fn().mockResolvedValue(undefined)
    const listAssignments = vi.fn()
    const routes = createRoleLifecycleRoutes({
      resolveContext,
      service: { authorizeListAssignments, listAssignments } as never,
    })

    await expect(routes.listAssignments({})).rejects.toMatchObject({ statusCode: 400 })
    expect(listAssignments).not.toHaveBeenCalled()
  })

  it.each([
    ['grant', 'authorizeGrant'],
    ['revoke', 'authorizeRevoke'],
  ] as const)('denies %s before reading its request body or invoking its operation', async (operation, guard) => {
    readBody.mockResolvedValue({ reason: 'body must not be read' })
    const resolveContext = vi.fn().mockResolvedValue(context([]))
    const authorize = vi.fn().mockRejectedValue(new AppApiError(403, 'PERMISSION_DENIED', 'Denied'))
    const action = vi.fn()
    const routes = createRoleLifecycleRoutes({
      resolveContext,
      service: { [guard]: authorize, [operation]: action } as never,
    })

    await expect(routes[operation]({} as never)).rejects.toMatchObject({
      statusCode: 403,
      code: 'PERMISSION_DENIED',
    })
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(authorize).toHaveBeenCalledWith(context([]))
    expect(readBody).not.toHaveBeenCalled()
    expect(action).not.toHaveBeenCalled()
  })
})

function roleQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    then: (resolve: (value: { data: unknown, error: unknown }) => unknown) => resolve({ data, error }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.is.mockReturnValue(query)
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

  it('reads only active company-scoped assignment summaries in deterministic order with an optional user filter', async () => {
    const query = roleQuery([{ id: 7, user_id: nhuUserId, role_id: roleId }])
    const from = vi.fn().mockReturnValue(query)
    const repository = createSupabaseRoleLifecycleRepository({ from, rpc: vi.fn() } as never)

    await expect(repository.listActiveAssignments(companyId, nhuUserId))
      .resolves.toEqual([{ id: 7, targetUserId: nhuUserId, roleId }])
    expect(from).toHaveBeenCalledWith('company_role_assignments')
    expect(query.eq).toHaveBeenNthCalledWith(1, 'company_id', companyId)
    expect(query.is).toHaveBeenCalledWith('revoked_at', null)
    expect(query.eq).toHaveBeenNthCalledWith(2, 'user_id', nhuUserId)
    expect(query.order).toHaveBeenCalledWith('id', { ascending: true })
  })

  it('fails closed when assignment-list rows contain an unexpected database field', async () => {
    const query = roleQuery([{ id: 7, user_id: nhuUserId, role_id: roleId, grant_reason: 'private' }])
    const repository = createSupabaseRoleLifecycleRepository({ from: vi.fn().mockReturnValue(query), rpc: vi.fn() } as never)

    await expect(repository.listActiveAssignments(companyId)).rejects.toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
    })
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

  it('uses the URL-scoped revoke RPC and maps target scope failures to a non-enumerating denial', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'PERMISSION_DENIED' },
    })
    const repository = createSupabaseRoleLifecycleRepository({ from: vi.fn(), rpc } as never)

    await expect(repository.revokeRole(companyId, 7, { reason: 'Transfer supplier sourcing' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(rpc).toHaveBeenCalledWith('revoke_company_role_assignment_scoped', {
      target_company_id: companyId,
      target_assignment_id: 7,
      target_revoke_reason: 'Transfer supplier sourcing',
    })
  })
})
