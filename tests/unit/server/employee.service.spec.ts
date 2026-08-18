import { describe, expect, it, vi } from 'vitest'
import { createEmployeeService } from '../../../server/features/employees/employee.service'
import type { EmployeeRepository } from '../../../server/features/employees/employee.repository'
import type { EmployeeDetail, EmployeePrivateDetails, EmployeeSummary } from '../../../shared/schemas/employees'

const companyId = '10000000-0000-4000-8000-000000000020'
const actorId = '10000000-0000-4000-8000-000000000001'
const otherUserId = '10000000-0000-4000-8000-000000000002'
const employeeId = '10000000-0000-4000-8000-000000000101'

const summary: EmployeeSummary = {
  id: employeeId,
  employeeCode: 'VQH-NHU',
  fullName: 'Như',
  workEmail: 'nhu@vqh.local',
  account: { email: 'nhu@vqh.local', userId: actorId },
  department: { id: '10000000-0000-4000-8000-000000000201', code: 'HR', name: 'Nhân sự' },
  position: null,
  hireDate: null,
  probationEndDate: null,
  employmentStatus: 'active',
  profileComplete: false,
  roles: [{
    id: '10000000-0000-4000-8000-000000000301',
    code: 'employee',
    name: 'Nhân viên',
    description: 'Directory access',
    isPrivileged: false,
    isSystem: true,
  }],
}

const privateDetails: EmployeePrivateDetails = {
  dateOfBirth: null,
  gender: null,
  personalEmail: null,
  personalPhone: null,
  currentAddress: null,
  permanentAddress: null,
  taxCode: null,
  socialInsuranceNumber: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
}

function repository(overrides: Partial<EmployeeRepository> = {}): EmployeeRepository {
  return {
    listDirectory: vi.fn().mockResolvedValue({ items: [summary], total: 1 }),
    getDirectoryEmployee: vi.fn().mockResolvedValue(summary),
    getPrivateDetails: vi.fn().mockResolvedValue(privateDetails),
    updateEmployee: vi.fn().mockResolvedValue({ ...summary, privateDetails }),
    ...overrides,
  }
}

function context(permissions: string[]) {
  return {
    actorId,
    companyId,
    tenantId: '10000000-0000-4000-8000-000000000010',
    permissions: permissions as never,
  }
}

describe('employee service', () => {
  it('denies directory access without the normalized directory permission', async () => {
    const employeeRepository = repository()
    const service = createEmployeeService(employeeRepository)

    await expect(service.list({
      actorId,
      companyId,
      tenantId: '10000000-0000-4000-8000-000000000010',
      permissions: [],
    }, { page: 1, pageSize: 25 })).rejects.toMatchObject({
      statusCode: 403,
      code: 'PERMISSION_DENIED',
    })
    expect(employeeRepository.listDirectory).not.toHaveBeenCalled()
  })

  it('returns the requested directory page within the authenticated company scope', async () => {
    const employeeRepository = repository()

    await expect(createEmployeeService(employeeRepository).list(
      context(['employee.read_directory']),
      { page: 2, pageSize: 10 },
    )).resolves.toEqual({ items: [summary], page: 2, pageSize: 10, total: 1 })
    expect(employeeRepository.listDirectory).toHaveBeenCalledWith(companyId, 2, 10)
  })

  it('returns private details for an employee reading their own profile', async () => {
    const employeeRepository = repository()

    await expect(createEmployeeService(employeeRepository).detail(
      context(['employee.read_directory', 'employee.read_self_private']),
      employeeId,
    )).resolves.toEqual({ ...summary, privateDetails })
    expect(employeeRepository.getPrivateDetails).toHaveBeenCalledWith(companyId, employeeId)
  })

  it('returns private details for a caller with company-wide private access', async () => {
    const employeeRepository = repository({
      getDirectoryEmployee: vi.fn().mockResolvedValue({
        ...summary,
        account: { email: 'long@vqh.local', userId: otherUserId },
      }),
    })

    await expect(createEmployeeService(employeeRepository).detail(
      context(['employee.read_directory', 'employee.read_private']),
      employeeId,
    )).resolves.toEqual({
      ...summary,
      account: { email: 'long@vqh.local', userId: otherUserId },
      privateDetails,
    })
  })

  it('redacts another employee private details for an ordinary directory caller', async () => {
    const employeeRepository = repository({
      getDirectoryEmployee: vi.fn().mockResolvedValue({
        ...summary,
        account: undefined,
        roles: undefined,
      }),
    })

    await expect(createEmployeeService(employeeRepository).detail(
      context(['employee.read_directory', 'employee.read_self_private']),
      employeeId,
    )).resolves.toEqual({ ...summary, account: undefined, roles: undefined })
    expect(employeeRepository.getPrivateDetails).not.toHaveBeenCalled()
  })

  it('normalizes a missing or cross-company employee to EMPLOYEE_NOT_FOUND', async () => {
    const employeeRepository = repository({ getDirectoryEmployee: vi.fn().mockResolvedValue(null) })

    await expect(createEmployeeService(employeeRepository).detail(
      context(['employee.read_directory']),
      employeeId,
    )).rejects.toMatchObject({ statusCode: 404, code: 'EMPLOYEE_NOT_FOUND' })
    expect(employeeRepository.getDirectoryEmployee).toHaveBeenCalledWith(companyId, employeeId)
  })

  it('forwards only the parsed update input within the authenticated company scope', async () => {
    const employeeRepository = repository()
    const input = { fullName: 'Như Nguyễn', positionId: null }
    const updated: EmployeeDetail = { ...summary, privateDetails }
    employeeRepository.updateEmployee = vi.fn().mockResolvedValue(updated)

    await expect(createEmployeeService(employeeRepository).update(
      context(['employee.update']),
      employeeId,
      input,
    )).resolves.toEqual(updated)
    expect(employeeRepository.updateEmployee).toHaveBeenCalledWith(companyId, employeeId, input)
  })

  it('denies an employee update without the normalized update permission', async () => {
    const employeeRepository = repository()

    await expect(createEmployeeService(employeeRepository).update(
      context(['employee.read_directory']),
      employeeId,
      { fullName: 'Như Nguyễn' },
    )).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(employeeRepository.updateEmployee).not.toHaveBeenCalled()
  })
})
