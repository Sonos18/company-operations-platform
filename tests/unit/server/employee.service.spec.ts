import { describe, expect, it, vi } from 'vitest'
import { createEmployeeService } from '../../../server/features/employees/employee.service'
import type { EmployeeRepository } from '../../../server/features/employees/employee.repository'
import type { EmployeeDetail, EmployeePrivateDetails, EmployeeSummary } from '../../../shared/schemas/employees'
import { AppApiError } from '../../../server/utils/api-error'

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

function invitedEmployee(workEmail = 'new@vqh.local'): EmployeeSummary {
  return {
    ...summary,
    employeeCode: 'VQH-NEW',
    fullName: 'Nguyễn Mới',
    workEmail,
    account: { email: workEmail, userId: otherUserId },
  }
}

function repository(overrides: Partial<EmployeeRepository> = {}): EmployeeRepository {
  return {
    listDirectory: vi.fn().mockResolvedValue({ items: [summary], total: 1 }),
    getDirectoryEmployee: vi.fn().mockResolvedValue(summary),
    getPrivateDetails: vi.fn().mockResolvedValue(privateDetails),
    updateEmployee: vi.fn().mockResolvedValue({ ...summary, privateDetails }),
    completeEmployeeOnboarding: vi.fn().mockResolvedValue(summary),
    offboardEmployee: vi.fn().mockResolvedValue({ employeeId, userId: otherUserId }),
    recordOffboardingAuthFailure: vi.fn().mockResolvedValue(undefined),
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
  it('invites a normalized work email then completes onboarding with the returned Auth user', async () => {
    const employeeRepository = repository({ completeEmployeeOnboarding: vi.fn().mockResolvedValue(invitedEmployee()) })
    const auth = {
      inviteUser: vi.fn().mockResolvedValue({ kind: 'invited', userId: otherUserId }),
      findUserByEmail: vi.fn(),
    }
    const service = createEmployeeService(employeeRepository) as unknown as {
      invite(context: ReturnType<typeof context>, input: {
        employeeCode: string
        fullName: string
        workEmail: string
        departmentId: string
      }, auth: typeof auth): Promise<EmployeeDetail>
    }

    await expect(service.invite(
      context(['account.invite', 'employee.create']),
      {
        employeeCode: 'VQH-NEW',
        fullName: 'Nguyễn Mới',
        workEmail: '  NEW@VQH.LOCAL ',
        departmentId: summary.department.id,
      },
      auth,
    )).resolves.toEqual(invitedEmployee())

    expect(auth.inviteUser).toHaveBeenCalledWith('new@vqh.local')
    expect(auth.findUserByEmail).not.toHaveBeenCalled()
    expect(employeeRepository.completeEmployeeOnboarding).toHaveBeenCalledWith(
      companyId,
      otherUserId,
      expect.objectContaining({ workEmail: 'new@vqh.local' }),
    )
  })

  it('reuses the exact normalized existing Auth user to retry incomplete onboarding', async () => {
    const employeeRepository = repository({ completeEmployeeOnboarding: vi.fn().mockResolvedValue(invitedEmployee()) })
    const auth = {
      inviteUser: vi.fn().mockResolvedValue({ kind: 'existing' }),
      findUserByEmail: vi.fn().mockResolvedValue({ kind: 'found', userId: otherUserId }),
    }
    const service = createEmployeeService(employeeRepository) as unknown as {
      invite(context: ReturnType<typeof context>, input: {
        employeeCode: string
        fullName: string
        workEmail: string
        departmentId: string
      }, auth: typeof auth): Promise<EmployeeDetail>
    }

    await expect(service.invite(
      context(['account.invite', 'employee.create']),
      {
        employeeCode: 'VQH-NEW',
        fullName: 'Nguyễn Mới',
        workEmail: 'NEW@VQH.LOCAL',
        departmentId: summary.department.id,
      },
      auth,
    )).resolves.toEqual(invitedEmployee())

    expect(auth.findUserByEmail).toHaveBeenCalledWith('new@vqh.local')
    expect(employeeRepository.completeEmployeeOnboarding).toHaveBeenCalledWith(
      companyId,
      otherUserId,
      expect.objectContaining({ workEmail: 'new@vqh.local' }),
    )
  })

  it('returns the schema-valid redacted summary when onboarding permissions do not include account or role read access', async () => {
    const redactedEmployee = { ...invitedEmployee(), account: undefined, roles: undefined }
    const employeeRepository = repository({
      completeEmployeeOnboarding: vi.fn().mockResolvedValue(redactedEmployee),
    })
    const auth = {
      inviteUser: vi.fn().mockResolvedValue({ kind: 'invited', userId: otherUserId }),
      findUserByEmail: vi.fn(),
    }
    const service = createEmployeeService(employeeRepository) as unknown as {
      invite(context: ReturnType<typeof context>, input: {
        employeeCode: string
        fullName: string
        workEmail: string
        departmentId: string
      }, auth: typeof auth): Promise<EmployeeDetail>
    }

    await expect(service.invite(
      context(['account.invite', 'employee.create']),
      {
        employeeCode: 'VQH-NEW',
        fullName: 'Nguyễn Mới',
        workEmail: 'new@vqh.local',
        departmentId: summary.department.id,
      },
      auth,
    )).resolves.toEqual(redactedEmployee)
  })

  it('fails safely when a documented existing-user response cannot be resolved by exact email', async () => {
    const employeeRepository = repository()
    const auth = {
      inviteUser: vi.fn().mockResolvedValue({ kind: 'existing' }),
      findUserByEmail: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    }
    const service = createEmployeeService(employeeRepository) as unknown as {
      invite(context: ReturnType<typeof context>, input: {
        employeeCode: string
        fullName: string
        workEmail: string
        departmentId: string
      }, auth: typeof auth): Promise<EmployeeDetail>
    }

    await expect(service.invite(
      context(['account.invite', 'employee.create']),
      {
        employeeCode: 'VQH-NEW',
        fullName: 'Nguyễn Mới',
        workEmail: 'new@vqh.local',
        departmentId: summary.department.id,
      },
      auth,
    )).rejects.toMatchObject({ statusCode: 502, code: 'ACCOUNT_INVITE_FAILED' })
    expect(employeeRepository.completeEmployeeOnboarding).not.toHaveBeenCalled()
  })

  it('redacts Auth provider details and maps Auth failures to ACCOUNT_INVITE_FAILED', async () => {
    const employeeRepository = repository()
    const auth = {
      inviteUser: vi.fn().mockResolvedValue({ kind: 'failed' }),
      findUserByEmail: vi.fn(),
    }
    const service = createEmployeeService(employeeRepository) as unknown as {
      invite(context: ReturnType<typeof context>, input: {
        employeeCode: string
        fullName: string
        workEmail: string
        departmentId: string
      }, auth: typeof auth): Promise<EmployeeDetail>
    }

    const result = service.invite(
      context(['account.invite', 'employee.create']),
      {
        employeeCode: 'VQH-NEW',
        fullName: 'Nguyễn Mới',
        workEmail: 'new@vqh.local',
        departmentId: summary.department.id,
      },
      auth,
    )
    await expect(result).rejects.toMatchObject({ statusCode: 502, code: 'ACCOUNT_INVITE_FAILED' })
    await expect(result).rejects.not.toThrow(/provider|secret|credential/i)
    expect(auth.findUserByEmail).not.toHaveBeenCalled()
    expect(employeeRepository.completeEmployeeOnboarding).not.toHaveBeenCalled()
  })

  it('preserves a stable incomplete-onboarding error after Auth succeeds', async () => {
    const employeeRepository = repository({
      completeEmployeeOnboarding: vi.fn().mockRejectedValue(
        new AppApiError(409, 'ONBOARDING_INCOMPLETE', 'Hồ sơ nhân viên chưa hoàn tất.'),
      ),
    })
    const auth = {
      inviteUser: vi.fn().mockResolvedValue({ kind: 'invited', userId: otherUserId }),
      findUserByEmail: vi.fn(),
    }
    const service = createEmployeeService(employeeRepository) as unknown as {
      invite(context: ReturnType<typeof context>, input: {
        employeeCode: string
        fullName: string
        workEmail: string
        departmentId: string
      }, auth: typeof auth): Promise<EmployeeDetail>
    }

    await expect(service.invite(
      context(['account.invite', 'employee.create']),
      {
        employeeCode: 'VQH-NEW',
        fullName: 'Nguyễn Mới',
        workEmail: 'new@vqh.local',
        departmentId: summary.department.id,
      },
      auth,
    )).rejects.toMatchObject({ statusCode: 409, code: 'ONBOARDING_INCOMPLETE' })
  })

  it.each([
    ['account.invite', ['account.invite']],
    ['employee.create', ['employee.create']],
  ] as const)('requires %s in addition to the other invitation permission', async (_missing, permissions) => {
    const employeeRepository = repository()
    const auth = {
      inviteUser: vi.fn(),
      findUserByEmail: vi.fn(),
    }
    const service = createEmployeeService(employeeRepository) as unknown as {
      invite(context: ReturnType<typeof context>, input: {
        employeeCode: string
        fullName: string
        workEmail: string
        departmentId: string
      }, auth: typeof auth): Promise<EmployeeDetail>
    }

    await expect(service.invite(
      context(permissions as string[]),
      {
        employeeCode: 'VQH-NEW',
        fullName: 'Nguyễn Mới',
        workEmail: 'new@vqh.local',
        departmentId: summary.department.id,
      },
      auth,
    )).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(auth.inviteUser).not.toHaveBeenCalled()
    expect(employeeRepository.completeEmployeeOnboarding).not.toHaveBeenCalled()
  })

  it('does not initialize Auth administration when either invitation permission is absent', async () => {
    const employeeRepository = repository()
    const authFactory = vi.fn()
    const service = createEmployeeService(employeeRepository) as unknown as {
      invite(context: ReturnType<typeof context>, input: {
        employeeCode: string
        fullName: string
        workEmail: string
        departmentId: string
      }, authFactory: () => unknown): Promise<EmployeeDetail>
    }

    await expect(service.invite(
      context(['account.invite']),
      {
        employeeCode: 'VQH-NEW',
        fullName: 'Nguyễn Mới',
        workEmail: 'new@vqh.local',
        departmentId: summary.department.id,
      },
      authFactory,
    )).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(authFactory).not.toHaveBeenCalled()
  })

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

  it('redacts own private details when employee.read_self_private is absent', async () => {
    const employeeRepository = repository()

    await expect(createEmployeeService(employeeRepository).detail(
      context(['employee.read_directory']),
      employeeId,
    )).resolves.toEqual(summary)
    expect(employeeRepository.getPrivateDetails).not.toHaveBeenCalled()
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
    )).resolves.toEqual(summary)
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

  it('redacts private details from an update response when update access lacks private-read access', async () => {
    const employeeRepository = repository()

    await expect(createEmployeeService(employeeRepository).update(
      context(['employee.update']),
      employeeId,
      { fullName: 'Như Nguyễn' },
    )).resolves.toEqual(summary)
    expect(employeeRepository.getPrivateDetails).not.toHaveBeenCalled()
  })

  it('returns private details from an update response only with an independent private-read permission', async () => {
    const employeeRepository = repository()

    await expect(createEmployeeService(employeeRepository).update(
      context(['employee.update', 'employee.read_private']),
      employeeId,
      { fullName: 'Như Nguyễn' },
    )).resolves.toEqual({ ...summary, privateDetails })
    expect(employeeRepository.getPrivateDetails).toHaveBeenCalledWith(companyId, employeeId)
  })

  it.each([
    ['employee.offboard', ['employee.offboard']],
    ['account.disable', ['account.disable']],
  ] as const)('denies offboarding without %s before database or Auth administration', async (_missing, permissions) => {
    const employeeRepository = repository()
    const authFactory = vi.fn()
    const service = createEmployeeService(employeeRepository) as unknown as {
      offboard(context: ReturnType<typeof context>, employeeId: string, input: { reason: string }, authFactory: () => unknown): Promise<unknown>
    }

    await expect(service.offboard(
      context(permissions as string[]),
      employeeId,
      { reason: 'Kết thúc hợp đồng' },
      authFactory,
    )).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(authFactory).not.toHaveBeenCalled()
    expect(employeeRepository.offboardEmployee).not.toHaveBeenCalled()
  })

  it('commits database offboarding before disabling the target Auth account', async () => {
    const calls: string[] = []
    const employeeRepository = repository({
      offboardEmployee: vi.fn(async () => {
        calls.push('database')
        return { employeeId, userId: otherUserId }
      }),
    })
    const auth = {
      disableUser: vi.fn(async () => {
        calls.push('auth')
        return { kind: 'disabled' }
      }),
    }
    const service = createEmployeeService(employeeRepository) as unknown as {
      offboard(context: ReturnType<typeof context>, employeeId: string, input: { reason: string }, auth: typeof auth): Promise<unknown>
    }

    await expect(service.offboard(
      context(['employee.offboard', 'account.disable']),
      employeeId,
      { reason: 'Kết thúc hợp đồng' },
      auth,
    )).resolves.toEqual({ employeeId, userId: otherUserId })
    expect(calls).toEqual(['database', 'auth'])
    expect(employeeRepository.offboardEmployee)
      .toHaveBeenCalledWith(companyId, employeeId, 'Kết thúc hợp đồng')
  })

  it('records one redacted database audit failure and hides Auth provider details when account disable fails', async () => {
    const calls: string[] = []
    const employeeRepository = repository({
      offboardEmployee: vi.fn(async () => {
        calls.push('database')
        return { employeeId, userId: otherUserId }
      }),
      recordOffboardingAuthFailure: vi.fn(async () => {
        calls.push('audit')
      }),
    })
    const auth = {
      disableUser: vi.fn().mockResolvedValue({ kind: 'failed', providerDetail: 'secret provider detail' }),
    }
    const service = createEmployeeService(employeeRepository) as unknown as {
      offboard(context: ReturnType<typeof context>, employeeId: string, input: { reason: string }, auth: typeof auth): Promise<unknown>
    }

    const result = service.offboard(
      context(['employee.offboard', 'account.disable']),
      employeeId,
      { reason: 'Kết thúc hợp đồng' },
      auth,
    )
    await expect(result).rejects.toMatchObject({ statusCode: 502, code: 'EMPLOYEE_OFFBOARDING_FAILED' })
    await expect(result).rejects.not.toThrow(/provider|secret|credential/i)
    expect(calls).toEqual(['database', 'audit'])
    expect(employeeRepository.recordOffboardingAuthFailure)
      .toHaveBeenCalledWith(companyId, employeeId)
  })

  it('retries idempotent database offboarding and disables the same target account again', async () => {
    const employeeRepository = repository({
      offboardEmployee: vi.fn().mockResolvedValue({ employeeId, userId: otherUserId }),
    })
    const auth = { disableUser: vi.fn().mockResolvedValue({ kind: 'disabled' }) }
    const service = createEmployeeService(employeeRepository) as unknown as {
      offboard(context: ReturnType<typeof context>, employeeId: string, input: { reason: string }, auth: typeof auth): Promise<unknown>
    }
    const requestContext = context(['employee.offboard', 'account.disable'])

    await expect(service.offboard(requestContext, employeeId, { reason: 'Kết thúc hợp đồng' }, auth))
      .resolves.toEqual({ employeeId, userId: otherUserId })
    await expect(service.offboard(requestContext, employeeId, { reason: 'retry ignored' }, auth))
      .resolves.toEqual({ employeeId, userId: otherUserId })
    expect(employeeRepository.offboardEmployee)
      .toHaveBeenCalledTimes(2)
    expect(auth.disableUser).toHaveBeenCalledTimes(2)
  })
})
