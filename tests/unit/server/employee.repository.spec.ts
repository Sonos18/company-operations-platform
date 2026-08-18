import { describe, expect, it, vi } from 'vitest'
import { createSupabaseEmployeeRepository } from '../../../server/features/employees/employee.repository'

const companyId = '10000000-0000-4000-8000-000000000020'
const employeeId = '10000000-0000-4000-8000-000000000101'

function query(result: { data: unknown, error: unknown, count?: number | null }) {
  const value = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (result: typeof result) => unknown, reject?: (reason: unknown) => unknown) => (
      Promise.resolve(result).then(resolve, reject)
    ),
  }
  value.select.mockReturnValue(value)
  value.eq.mockReturnValue(value)
  value.in.mockReturnValue(value)
  value.order.mockReturnValue(value)
  value.range.mockReturnValue(value)
  value.update.mockReturnValue(value)
  return value
}

const employeeRow = {
  id: employeeId,
  employee_code: 'VQH-NHU',
  full_name: 'Như',
  work_email: 'nhu@vqh.local',
  department_id: '10000000-0000-4000-8000-000000000201',
  position_id: null,
  hire_date: null,
  probation_end_date: null,
  employment_status: 'active',
  departments: { id: '10000000-0000-4000-8000-000000000201', code: 'HR', name: 'Nhân sự' },
  positions: null,
}

const employeeRole = {
  id: '10000000-0000-4000-8000-000000000301',
  code: 'employee',
  name: 'Nhân viên',
  description: 'Company directory access',
  is_privileged: false,
  is_system: true,
}

describe('Supabase employee repository', () => {
  it('fails closed when an access-link RPC response contains an unrequested employee ID', async () => {
    const employees = query({ data: [employeeRow], error: null, count: 1 })
    const roles = query({ data: [employeeRole], error: null })
    const db = {
      from: vi.fn((table: string) => table === 'employees' ? employees : roles),
      rpc: vi.fn().mockResolvedValue({
        data: [{ employee_id: '10000000-0000-4000-8000-000000000199', user_id: employeeId, role_codes: ['employee'] }],
        error: null,
      }),
    }

    await expect(createSupabaseEmployeeRepository(db as never).listDirectory(companyId, 1, 25))
      .rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
  })

  it('fails closed for null and duplicate access-link RPC output', async () => {
    const employees = query({ data: [employeeRow], error: null, count: 1 })
    const roles = query({ data: [employeeRole], error: null })
    const nullOutput = {
      from: vi.fn((table: string) => table === 'employees' ? employees : roles),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    await expect(createSupabaseEmployeeRepository(nullOutput as never).listDirectory(companyId, 1, 25))
      .rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })

    const duplicateOutput = {
      from: vi.fn((table: string) => table === 'employees' ? employees : roles),
      rpc: vi.fn().mockResolvedValue({
        data: [
          { employee_id: employeeId, user_id: employeeId, role_codes: ['employee'] },
          { employee_id: employeeId, user_id: employeeId, role_codes: ['employee'] },
        ],
        error: null,
      }),
    }
    await expect(createSupabaseEmployeeRepository(duplicateOutput as never).listDirectory(companyId, 1, 25))
      .rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
  })

  it('fails rather than silently redacting a returned access link whose role metadata is incomplete', async () => {
    const employees = query({ data: [employeeRow], error: null, count: 1 })
    const roles = query({ data: [], error: null })
    const db = {
      from: vi.fn((table: string) => table === 'employees' ? employees : roles),
      rpc: vi.fn().mockResolvedValue({
        data: [{ employee_id: employeeId, user_id: employeeId, role_codes: ['employee'] }],
        error: null,
      }),
    }

    await expect(createSupabaseEmployeeRepository(db as never).listDirectory(companyId, 1, 25))
      .rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
  })

  it('sends PATCH mutations through the atomic scoped RPC rather than direct table updates', async () => {
    const empty = query({ data: null, error: null })
    const rpc = vi.fn().mockResolvedValue({ data: employeeId, error: null })
    const db = { from: vi.fn().mockReturnValue(empty), rpc }

    await expect(createSupabaseEmployeeRepository(db as never).updateEmployee(
      companyId,
      employeeId,
      { fullName: 'Như Nguyễn', privateDetails: { personalPhone: '0900000000' } },
    )).resolves.toBeNull()
    expect(rpc).toHaveBeenCalledWith('update_employee_profile', {
      target_company_id: companyId,
      target_employee_id: employeeId,
      target_update: {
        fullName: 'Như Nguyễn',
        privateDetails: { personalPhone: '0900000000' },
      },
    })
    expect(empty.update).not.toHaveBeenCalled()
  })

  it('normalizes an RPC missing target and work-email conflict without exposing database text', async () => {
    const empty = query({ data: null, error: null })
    const missing = {
      from: vi.fn().mockReturnValue(empty),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: 'EMPLOYEE_NOT_FOUND' } }),
    }
    await expect(createSupabaseEmployeeRepository(missing as never).updateEmployee(
      companyId,
      employeeId,
      { fullName: 'Như Nguyễn' },
    )).resolves.toBeNull()

    const emailConflict = {
      from: vi.fn().mockReturnValue(empty),
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint "employees_company_work_email_key"' },
      }),
    }
    await expect(createSupabaseEmployeeRepository(emailConflict as never).updateEmployee(
      companyId,
      employeeId,
      { workEmail: 'existing@vqh.local' },
    )).rejects.toMatchObject({ statusCode: 409, code: 'EMPLOYEE_EMAIL_CONFLICT' })
  })
})
