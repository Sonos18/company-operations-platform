import { describe, expect, it, vi } from 'vitest'
import {
  createAuthorizationService,
  createSupabaseAuthorizationReader,
} from '../../../server/features/authorization/authorization.service'

const userId = '10000000-0000-4000-8000-000000000001'
const companyId = '10000000-0000-4000-8000-000000000020'

describe('authorization service', () => {
  it('returns a deterministic normalized union from the access RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        roles: ['hr_manager', 'employee', 'hr_manager'],
        permissions: ['employee.read_private', 'employee.read_directory', 'employee.read_private'],
      }],
      error: null,
    })
    const reader = createSupabaseAuthorizationReader({ rpc } as never)

    await expect(reader.listAccess(userId, companyId)).resolves.toEqual({
      roles: ['employee', 'hr_manager'],
      permissions: ['employee.read_directory', 'employee.read_private'],
    })
    expect(rpc).toHaveBeenCalledWith('get_my_company_access', {
      target_company_id: companyId,
    })
  })

  it('fails closed when the access RPC does not return exactly one valid row', async () => {
    const reader = createSupabaseAuthorizationReader({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as never)

    await expect(reader.listAccess(userId, companyId))
      .rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
  })

  it('allows a permission supplied by the current normalized access', async () => {
    const reader = {
      listAccess: vi.fn().mockResolvedValue({
        roles: ['employee'],
        permissions: ['employee.read_directory'],
      }),
    }

    await expect(createAuthorizationService(reader).requirePermission(
      userId,
      companyId,
      'employee.read_directory',
    )).resolves.toEqual({
      roles: ['employee'],
      permissions: ['employee.read_directory'],
    })
  })

  it('denies a permission removed between calls without a JWT refresh', async () => {
    const reader = {
      listAccess: vi.fn()
        .mockResolvedValueOnce({
          roles: ['hr_manager'],
          permissions: ['employee.read_private'],
        })
        .mockResolvedValueOnce({
          roles: [],
          permissions: [],
        }),
    }
    const service = createAuthorizationService(reader)

    await expect(service.requirePermission(userId, companyId, 'employee.read_private'))
      .resolves.toMatchObject({ roles: ['hr_manager'] })
    await expect(service.requirePermission(userId, companyId, 'employee.read_private'))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(reader.listAccess).toHaveBeenCalledTimes(2)
  })
})
