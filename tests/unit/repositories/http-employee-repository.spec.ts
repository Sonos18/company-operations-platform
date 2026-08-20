import { describe, expect, it, vi } from 'vitest'
import { createHttpEmployeeRepository, EmployeeRepositoryError } from '../../../app/repositories/http/http-employee-repository'

const companyId = '10000000-0000-4000-8000-000000000020'
const employeeId = '10000000-0000-4000-8000-000000000401'
const employee = {
  id: employeeId,
  employeeCode: 'VQH-NHU',
  fullName: 'Như',
  workEmail: 'nhu@vqh.local',
  account: { userId: '10000000-0000-4000-8000-000000000101', email: 'nhu@vqh.local' },
  department: { id: '10000000-0000-4000-8000-000000000202', code: 'HR', name: 'Phòng Nhân sự' },
  position: null,
  hireDate: null,
  probationEndDate: null,
  employmentStatus: 'active',
  profileComplete: false,
  roles: [{
    id: '10000000-0000-4000-8000-000000000301', code: 'employee', name: 'Nhân viên',
    description: 'Company directory and assigned-work access', isPrivileged: false, isSystem: true,
  }],
}

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(body) }
}

describe('HTTP employee repository', () => {
  it('maps the paginated list envelope and sends the injected bearer token to the company-scoped URL', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ items: [employee], page: 1, pageSize: 100, total: 1 }))
    const getAccessToken = vi.fn().mockResolvedValue('injected-access-token')
    const repository = createHttpEmployeeRepository({ companyId, getAccessToken, fetch })

    await expect(repository.list()).resolves.toEqual([employee])
    expect(fetch).toHaveBeenCalledWith(
      `/api/companies/${companyId}/employees?page=1&pageSize=100`,
      expect.objectContaining({ headers: { Authorization: 'Bearer injected-access-token' } }),
    )
    expect(getAccessToken).toHaveBeenCalledTimes(1)
  })

  it('uses company-scoped detail and update URLs and validates the update input before sending it', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(employee))
      .mockResolvedValueOnce(response({ ...employee, fullName: 'Như Nguyễn' }))
    const repository = createHttpEmployeeRepository({
      companyId,
      getAccessToken: () => 'token',
      fetch,
    })

    await expect(repository.getById(employeeId)).resolves.toEqual(employee)
    await expect(repository.update(employeeId, { fullName: 'Như Nguyễn' })).resolves.toMatchObject({ fullName: 'Như Nguyễn' })
    expect(fetch).toHaveBeenNthCalledWith(1, `/api/companies/${companyId}/employees/${employeeId}`, expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, `/api/companies/${companyId}/employees/${employeeId}`, expect.objectContaining({
      method: 'PATCH',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Như Nguyễn' }),
    }))
    await expect(repository.update(employeeId, { employmentStatus: 'terminated' as never }))
      .rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('loads every internal page and maps a stable not-found API response to null', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ items: [employee], page: 1, pageSize: 100, total: 2 }))
      .mockResolvedValueOnce(response({ items: [employee], page: 2, pageSize: 100, total: 2 }))
      .mockResolvedValueOnce(response({
        error: { code: 'EMPLOYEE_NOT_FOUND', message: 'raw database detail', requestId: 'request-2', details: {} },
      }, 404))
    const repository = createHttpEmployeeRepository({ companyId, getAccessToken: () => 'token', fetch })

    await expect(repository.list()).resolves.toEqual([employee, employee])
    await expect(repository.getById(employeeId)).resolves.toBeNull()
    expect(fetch).toHaveBeenNthCalledWith(2,
      `/api/companies/${companyId}/employees?page=2&pageSize=100`, expect.any(Object))
  })

  it('handles missing tokens, malformed responses, and stable API errors without retaining raw server details', async () => {
    const missingToken = createHttpEmployeeRepository({
      companyId,
      getAccessToken: () => null,
      fetch: vi.fn(),
    })
    await expect(missingToken.list()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })

    const malformed = createHttpEmployeeRepository({
      companyId,
      getAccessToken: () => 'token',
      fetch: vi.fn().mockResolvedValue(response({ items: [], page: 'one', pageSize: 100, total: 0 })),
    })
    await expect(malformed.list()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })

    const apiFailure = createHttpEmployeeRepository({
      companyId,
      getAccessToken: () => 'token',
      fetch: vi.fn().mockResolvedValue(response({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Provider detail: credential=do-not-leak',
          requestId: 'request-1',
          details: { provider: 'sensitive' },
        },
      }, 403)),
    })
    const result = apiFailure.list()
    await expect(result).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await expect(result).rejects.not.toThrow(/provider|credential|sensitive/i)
    await expect(result).rejects.toBeInstanceOf(EmployeeRepositoryError)
  })

  it('sanitizes arbitrary injected token-provider failures before issuing a request', async () => {
    const fetch = vi.fn()
    const repository = createHttpEmployeeRepository({
      companyId,
      getAccessToken: () => { throw new Error('provider secret credential detail') },
      fetch,
    })

    const result = repository.list()
    await expect(result).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    await expect(result).rejects.not.toThrow(/provider|secret|credential|detail/i)
    expect(fetch).not.toHaveBeenCalled()
  })
})
