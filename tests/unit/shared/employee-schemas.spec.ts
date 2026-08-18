import { describe, expect, it } from 'vitest'
import { apiErrorCodeSchema } from '../../../shared/schemas/api-error'
import {
  employeeDetailSchema,
  employeeInvitationInputSchema,
  employeeListQuerySchema,
  employeeListResponseSchema,
  employeeSummarySchema,
  employeeUpdateInputSchema,
} from '../../../shared/schemas/employees'
import { roleAssignmentInputSchema } from '../../../shared/schemas/rbac'
import { companyAccessSchema, sessionResponseSchema } from '../../../shared/schemas/session'

const ids = {
  employee: '10000000-0000-4000-8000-000000000401',
  user: '10000000-0000-4000-8000-000000000101',
  department: '10000000-0000-4000-8000-000000000202',
  position: '10000000-0000-4000-8000-000000000211',
  role: '10000000-0000-4000-8000-000000000301',
  tenant: '10000000-0000-4000-8000-000000000010',
  company: '10000000-0000-4000-8000-000000000020',
}

const employeeSummary = {
  id: ids.employee,
  employeeCode: 'VQH-NHU',
  fullName: 'Như',
  workEmail: 'nhu@vqh.local',
  account: {
    userId: ids.user,
    email: 'nhu@vqh.local',
  },
  department: {
    id: ids.department,
    code: 'HR',
    name: 'Phòng Nhân sự',
  },
  position: null,
  hireDate: null,
  probationEndDate: null,
  employmentStatus: 'active',
  profileComplete: false,
  roles: [{
    id: ids.role,
    code: 'employee',
    name: 'Nhân viên',
    description: 'Company directory access',
    isPrivileged: false,
    isSystem: true,
  }],
}

describe('employee shared schemas', () => {
  it('parses an authorized employee summary with its account, department, and active role', () => {
    expect(employeeSummarySchema.parse(employeeSummary)).toEqual(employeeSummary)
  })

  it('allows nullable employment and private-detail fields in an authorized employee detail', () => {
    expect(employeeDetailSchema.parse({
      ...employeeSummary,
      position: {
        id: ids.position,
        code: 'HR-ASSISTANT',
        name: 'HR Assistant',
        level: null,
      },
      hireDate: null,
      probationEndDate: null,
      privateDetails: {
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
      },
    })).toMatchObject({
      id: ids.employee,
      position: { id: ids.position, level: null },
      privateDetails: { taxCode: null },
    })
  })

  it('normalizes invitation emails and rejects scope or role mass assignment', () => {
    expect(employeeInvitationInputSchema.parse({
      employeeCode: 'VQH-NEW',
      fullName: 'New Employee',
      workEmail: '  NEW.EMPLOYEE@EXAMPLE.COM  ',
      departmentId: ids.department,
      positionId: ids.position,
      hireDate: '2026-08-18',
    })).toMatchObject({ workEmail: 'new.employee@example.com' })

    expect(employeeInvitationInputSchema.safeParse({
      employeeCode: 'VQH-NEW',
      fullName: 'New Employee',
      workEmail: 'new.employee@example.com',
      departmentId: ids.department,
      roles: [ids.role],
    }).success).toBe(false)
  })

  it('rejects unknown employment statuses and malformed resource IDs', () => {
    expect(employeeSummarySchema.safeParse({
      ...employeeSummary,
      employmentStatus: 'suspended',
    }).success).toBe(false)
    expect(employeeInvitationInputSchema.safeParse({
      employeeCode: 'VQH-NEW',
      fullName: 'New Employee',
      workEmail: 'new.employee@example.com',
      departmentId: 'not-a-uuid',
    }).success).toBe(false)
  })

  it('allows a regular-viewer employee projection to redact account and role data together', () => {
    const { account: _account, roles: _roles, ...redactedSummary } = employeeSummary

    expect(employeeSummarySchema.parse(redactedSummary)).toEqual(redactedSummary)
  })

  it('rejects half-redacted employee projections and empty authorized role arrays', () => {
    const { account: _account, roles: _roles, ...redactedSummary } = employeeSummary

    expect(employeeSummarySchema.parse({
      ...employeeSummary,
      account: { email: 'nhu@vqh.local' },
    }).account).toEqual({ email: 'nhu@vqh.local' })
    expect(employeeSummarySchema.safeParse({
      ...redactedSummary,
      account: employeeSummary.account,
    }).success).toBe(false)
    expect(employeeSummarySchema.safeParse({
      ...redactedSummary,
      roles: employeeSummary.roles,
    }).success).toBe(false)
    expect(employeeSummarySchema.safeParse({
      ...employeeSummary,
      roles: [],
    }).success).toBe(false)
  })

  it('accepts only explicitly allowed update and role-assignment fields', () => {
    expect(employeeUpdateInputSchema.parse({
      workEmail: '  NEW.EMPLOYEE@EXAMPLE.COM ',
      positionId: null,
      hireDate: null,
    })).toMatchObject({ workEmail: 'new.employee@example.com', positionId: null })
    expect(employeeUpdateInputSchema.safeParse({ tenantId: ids.tenant }).success).toBe(false)
    expect(employeeUpdateInputSchema.safeParse({ employmentStatus: 'terminated' }).success).toBe(false)
    expect(employeeUpdateInputSchema.parse({ employmentStatus: 'on_leave' })).toEqual({
      employmentStatus: 'on_leave',
    })

    expect(roleAssignmentInputSchema.safeParse({
      targetUserId: ids.user,
      roleId: ids.role,
      reason: '  Covers the inventory audit rotation.  ',
    })).toMatchObject({
      success: true,
      data: { targetUserId: ids.user, roleId: ids.role, reason: 'Covers the inventory audit rotation.' },
    })
    expect(roleAssignmentInputSchema.safeParse({
      targetUserId: ids.user,
      roleId: ids.role,
      reason: ' ',
      grantedBy: ids.user,
    }).success).toBe(false)
  })

  it('bounds directory pagination and preserves its response envelope', () => {
    expect(employeeListQuerySchema.parse({ page: '2', pageSize: '50' })).toEqual({ page: 2, pageSize: 50 })
    expect(employeeListQuerySchema.safeParse({ page: '0', pageSize: '101' }).success).toBe(false)
    expect(employeeListResponseSchema.parse({
      items: [employeeSummary],
      page: 2,
      pageSize: 50,
      total: 51,
    })).toMatchObject({ page: 2, pageSize: 50, total: 51 })
  })

  it('deduplicates normalized company roles and accepts only canonical permission codes', () => {
    expect(companyAccessSchema.parse({
      tenantId: ids.tenant,
      companyId: ids.company,
      companyCode: 'VQH',
      companyName: 'Việt Quốc Huy',
      roles: ['employee', 'employee', 'hr_manager'],
      permissions: ['employee.read_directory', 'employee.read_directory'],
    })).toMatchObject({
      roles: ['employee', 'hr_manager'],
      permissions: ['employee.read_directory'],
    })
    expect(companyAccessSchema.safeParse({
      tenantId: ids.tenant,
      companyId: ids.company,
      companyCode: 'VQH',
      companyName: 'Việt Quốc Huy',
      roles: ['employee'],
      permissions: ['employee.*'],
    }).success).toBe(false)
  })

  it('rejects unknown fields in company access and session responses', () => {
    const companyAccess = {
      tenantId: ids.tenant,
      companyId: ids.company,
      companyCode: 'VQH',
      companyName: 'Việt Quốc Huy',
      roles: ['employee'],
      permissions: ['employee.read_directory'],
    }

    expect(companyAccessSchema.safeParse({
      ...companyAccess,
      legacyMembershipRoles: ['company_admin'],
    }).success).toBe(false)
    expect(sessionResponseSchema.safeParse({
      user: { id: ids.user, email: 'nhu@vqh.local', isAdmin: true },
      companies: [companyAccess],
    }).success).toBe(false)
    expect(sessionResponseSchema.safeParse({
      user: { id: ids.user, email: 'nhu@vqh.local' },
      companies: [companyAccess],
      actorId: ids.user,
    }).success).toBe(false)
  })

  it.each([
    'PERMISSION_DENIED',
    'EMPLOYEE_NOT_FOUND',
    'EMPLOYEE_ACCOUNT_REQUIRED',
    'EMPLOYEE_EMAIL_CONFLICT',
    'ACCOUNT_INVITE_FAILED',
    'ONBOARDING_INCOMPLETE',
    'ROLE_ASSIGNMENT_CONFLICT',
    'SELF_ROLE_CHANGE_FORBIDDEN',
    'LAST_COMPANY_ADMIN_REQUIRED',
    'EMPLOYEE_OFFBOARDING_FAILED',
  ])('accepts the stable %s API error code', code => {
    expect(apiErrorCodeSchema.safeParse(code).success).toBe(true)
  })
})
