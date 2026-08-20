import { beforeEach, describe, expect, it } from 'vitest'
import { createMockRepositories } from '../../../app/repositories/mock/mock-repositories'
import { INITIAL_MOCK_STATE } from '../../../app/repositories/mock/fixtures'
import { validateMockState } from '../../../app/repositories/mock/schemas'
import { MemoryStateStore } from '../../../app/repositories/mock/state-store'

describe('mock employee repository', () => {
  const context = { tenantId: 'tenant-vqh', companyId: 'company-vqh' }
  const repositories = createMockRepositories(new MemoryStateStore(), context)

  beforeEach(async () => repositories.prototype.reset())

  it('backfills canonical employees when a saved prototype state predates the employee field', () => {
    const { employees: _employees, ...savedBeforeEmployees } = INITIAL_MOCK_STATE

    expect(validateMockState(savedBeforeEmployees).employees).toHaveLength(6)
  })

  it('returns the six canonical VQH employees with their accounts, departments, and active roles', async () => {
    const employees = await repositories.employees.list()

    expect(employees.map(employee => [
      employee.employeeCode,
      employee.fullName,
      employee.account?.email,
      employee.department.code,
      employee.department.name,
      employee.roles?.map(role => role.code),
    ])).toEqual([
      ['VQH-NHU', 'Như', 'nhu@vqh.local', 'HR', 'Phòng Nhân sự', ['employee', 'hr_manager', 'supplier_sourcing', 'inventory_auditor']],
      ['VQH-LONG', 'Long', 'long@vqh.local', 'TECH', 'Phòng Kỹ thuật', ['employee', 'technical_staff']],
      ['VQH-HIEU', 'Hiếu', 'hieu@vqh.local', 'TECH', 'Phòng Kỹ thuật', ['employee', 'technical_staff']],
      ['VQH-Y', 'Y', 'y@vqh.local', 'ACCOUNTING', 'Phòng Kế toán', ['employee', 'accountant']],
      ['VQH-NHI', 'Nhi', 'nhi@vqh.local', 'DESIGN', 'Phòng Thiết kế', ['employee', 'designer']],
      ['VQH-HAU', 'Hậu', 'hau@vqh.local', 'DESIGN', 'Phòng Thiết kế', ['employee', 'designer']],
    ])
    expect(employees.every(employee => (
      employee.position === null
      && employee.hireDate === null
      && employee.probationEndDate === null
      && employee.profileComplete === false
    ))).toBe(true)
    expect(employees.every(employee => !('privateDetails' in employee))).toBe(true)
  })

  it('updates schema-valid employee data, persists it, and returns immutable copies', async () => {
    const employee = await repositories.employees.getById('10000000-0000-4000-8000-000000000401')
    expect(employee).not.toBeNull()

    const updated = await repositories.employees.update(employee!.id, {
      fullName: 'Như Nguyễn',
      workEmail: '  NHU.NGUYEN@VQH.LOCAL  ',
      employmentStatus: 'on_leave',
      privateDetails: { personalPhone: '0900000000' },
    })
    updated.fullName = 'Mutated response'

    await expect(repositories.employees.getById(employee!.id)).resolves.toMatchObject({
      fullName: 'Như Nguyễn',
      workEmail: 'nhu.nguyen@vqh.local',
      employmentStatus: 'on_leave',
      privateDetails: { personalPhone: '0900000000', dateOfBirth: null },
    })
    await expect(repositories.employees.update(employee!.id, {
      employmentStatus: 'terminated' as never,
    })).rejects.toThrow()
  })

  it('returns null or a scoped not-found error without exposing another company employee', async () => {
    await expect(repositories.employees.getById('00000000-0000-4000-8000-000000000001')).resolves.toBeNull()
    await expect(repositories.employees.update('00000000-0000-4000-8000-000000000001', {
      fullName: 'Không tồn tại',
    })).rejects.toThrow('không thuộc phạm vi công ty')
  })

  it('updates and clears a manager only when the manager belongs to the active company scope', async () => {
    const store = new MemoryStateStore()
    const scopedRepositories = createMockRepositories(store, context)
    await scopedRepositories.prototype.reset()
    const employeeId = '10000000-0000-4000-8000-000000000401'
    const managerEmployeeId = '10000000-0000-4000-8000-000000000402'

    await scopedRepositories.employees.update(employeeId, { managerEmployeeId })
    expect(store.read()?.employees.find(employee => employee.id === employeeId)?.managerEmployeeId)
      .toBe(managerEmployeeId)

    await scopedRepositories.employees.update(employeeId, { managerEmployeeId: null })
    expect(store.read()?.employees.find(employee => employee.id === employeeId)?.managerEmployeeId)
      .toBeNull()

    await expect(scopedRepositories.employees.update(employeeId, {
      managerEmployeeId: '00000000-0000-4000-8000-000000000001',
    })).rejects.toThrow('không thuộc phạm vi công ty')
  })

  it('never resolves a department from another tenant or company in persisted state', async () => {
    const store = new MemoryStateStore()
    const state = validateMockState(structuredClone(INITIAL_MOCK_STATE))
    const foreignDepartmentEmployee = structuredClone(state.employees[1])
    foreignDepartmentEmployee.tenantId = 'tenant-other'
    foreignDepartmentEmployee.companyId = 'company-other'
    foreignDepartmentEmployee.department = {
      ...foreignDepartmentEmployee.department,
      code: 'FOREIGN',
      name: 'Phòng không thuộc phạm vi',
    }
    state.employees.unshift(foreignDepartmentEmployee)
    store.write(state)
    const scopedRepositories = createMockRepositories(store, context)

    await scopedRepositories.employees.update('10000000-0000-4000-8000-000000000401', {
      departmentId: '10000000-0000-4000-8000-000000000203',
    })

    await expect(scopedRepositories.employees.getById('10000000-0000-4000-8000-000000000401'))
      .resolves.toMatchObject({ department: { code: 'TECH', name: 'Phòng Kỹ thuật' } })
  })
})
