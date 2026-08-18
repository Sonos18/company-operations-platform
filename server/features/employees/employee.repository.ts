import type {
  EmployeePrivateDetails,
  EmployeeSummary,
  EmployeeUpdateInput,
} from '../../../shared/schemas/employees'
import { z } from 'zod'
import { AppApiError } from '../../utils/api-error'
import type { UserSupabaseClient } from '../../utils/supabase-client'

export interface EmployeeRepository {
  listDirectory(companyId: string, page: number, pageSize: number): Promise<{
    items: EmployeeSummary[]
    total: number
  }>
  getDirectoryEmployee(companyId: string, employeeId: string): Promise<EmployeeSummary | null>
  getPrivateDetails(companyId: string, employeeId: string): Promise<EmployeePrivateDetails | null>
  updateEmployee(
    companyId: string,
    employeeId: string,
    input: EmployeeUpdateInput,
  ): Promise<EmployeeSummary | null>
}

interface QueryResult {
  data: unknown
  error: unknown
  count?: number | null
}

interface Query extends PromiseLike<QueryResult> {
  select(columns: string, options?: { count?: 'exact' }): Query
  eq(column: string, value: string): Query
  in(column: string, values: string[]): Query
  order(column: string, options?: { ascending?: boolean }): Query
  range(from: number, to: number): Query
  maybeSingle(): Promise<QueryResult>
}

type UpdateJson = string | null | { [key: string]: UpdateJson }

interface EmployeeDataClient {
  from(table: 'employees' | 'employee_private_details' | 'roles'): Query
  rpc(
    functionName: 'get_company_employee_access_links',
    arguments_: { target_company_id: string, target_employee_ids: string[] },
  ): Promise<QueryResult>
  rpc(
    functionName: 'update_employee_profile',
    arguments_: {
      target_company_id: string
      target_employee_id: string
      target_update: { [key: string]: UpdateJson }
    },
  ): Promise<QueryResult>
}

const employeeRowSchema = z.object({
  id: z.string().uuid(),
  employee_code: z.string().trim().min(1),
  full_name: z.string().trim().min(1),
  work_email: z.string().email(),
  department_id: z.string().uuid(),
  position_id: z.string().uuid().nullable(),
  hire_date: z.string().date().nullable(),
  probation_end_date: z.string().date().nullable(),
  employment_status: z.enum(['probation', 'active', 'on_leave', 'terminated']),
  departments: z.union([
    z.object({ id: z.string().uuid(), code: z.string().min(1), name: z.string().min(1) }).strict(),
    z.array(z.object({ id: z.string().uuid(), code: z.string().min(1), name: z.string().min(1) }).strict()).length(1),
  ]),
  positions: z.union([
    z.object({ id: z.string().uuid(), code: z.string().min(1), name: z.string().min(1), level: z.number().int().positive().nullable() }).strict(),
    z.array(z.object({ id: z.string().uuid(), code: z.string().min(1), name: z.string().min(1), level: z.number().int().positive().nullable() }).strict()).length(1),
  ]).nullable(),
}).strict()

const accessLinkSchema = z.object({
  employee_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role_codes: z.array(z.string().trim().min(1)).min(1),
}).strict()

const roleRowSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  is_privileged: z.boolean(),
  is_system: z.boolean(),
}).strict()

const privateDetailsRowSchema = z.object({
  date_of_birth: z.string().date().nullable(),
  gender: z.enum(['female', 'male', 'other', 'undisclosed']).nullable(),
  personal_email: z.string().email().nullable(),
  personal_phone: z.string().min(1).nullable(),
  current_address: z.string().min(1).nullable(),
  permanent_address: z.string().min(1).nullable(),
  tax_code: z.string().min(1).nullable(),
  social_insurance_number: z.string().min(1).nullable(),
  emergency_contact_name: z.string().min(1).nullable(),
  emergency_contact_phone: z.string().min(1).nullable(),
}).strict()

const employeeColumns = 'id, employee_code, full_name, work_email, department_id, position_id, hire_date, probation_end_date, employment_status, departments!inner(id, code, name), positions(id, code, name, level)'
const roleColumns = 'id, code, name, description, is_privileged, is_system'
const privateColumns = 'date_of_birth, gender, personal_email, personal_phone, current_address, permanent_address, tax_code, social_insurance_number, emergency_contact_name, emergency_contact_phone'

function failDatabase(message: string): never {
  throw new AppApiError(500, 'INTERNAL_ERROR', message)
}

function mapUpdateRpcError(error: unknown): null {
  const known = z.object({ code: z.string().optional(), message: z.string().optional() }).safeParse(error)
  if (known.success && known.data.code === 'P0001') {
    if (known.data.message === 'EMPLOYEE_NOT_FOUND') return null
    if (known.data.message === 'PERMISSION_DENIED') {
      throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
    }
    if (known.data.message === 'ONBOARDING_INCOMPLETE') {
      throw new AppApiError(409, 'ONBOARDING_INCOMPLETE', 'Hồ sơ nhân viên chưa hoàn tất.')
    }
    if (known.data.message === 'EMPLOYEE_OFFBOARDING_FAILED') {
      throw new AppApiError(409, 'EMPLOYEE_OFFBOARDING_FAILED', 'Chỉ quy trình nghỉ việc mới có thể chấm dứt nhân viên.')
    }
  }
  if (known.success && known.data.code === '23505'
    && known.data.message?.includes('employees_company_work_email_key')) {
    throw new AppApiError(409, 'EMPLOYEE_EMAIL_CONFLICT', 'Email công việc đã được sử dụng trong công ty này.')
  }
  return failDatabase('Không thể cập nhật nhân viên.')
}

function one<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0]! : value
}

function mapPrivateDetails(row: z.infer<typeof privateDetailsRowSchema>): EmployeePrivateDetails {
  return {
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    personalEmail: row.personal_email,
    personalPhone: row.personal_phone,
    currentAddress: row.current_address,
    permanentAddress: row.permanent_address,
    taxCode: row.tax_code,
    socialInsuranceNumber: row.social_insurance_number,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
  }
}

function mapEmployee(
  row: z.infer<typeof employeeRowSchema>,
  link: z.infer<typeof accessLinkSchema> | undefined,
  rolesByCode: Map<string, z.infer<typeof roleRowSchema>>,
): EmployeeSummary {
  const department = one(row.departments)
  const position = row.positions === null ? null : one(row.positions)
  if (link && link.role_codes.some(code => !rolesByCode.has(code))) {
    failDatabase('Không thể đọc vai trò nhân viên.')
  }
  const access = link
    ? {
        account: { email: row.work_email, userId: link.user_id },
        roles: link.role_codes.map(code => {
          const role = rolesByCode.get(code)
          if (!role) failDatabase('Không thể đọc vai trò nhân viên.')
          return {
            id: role.id,
            code: role.code,
            name: role.name,
            description: role.description,
            isPrivileged: role.is_privileged,
            isSystem: role.is_system,
          }
        }),
      }
    : {}

  return {
    id: row.id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    workEmail: row.work_email,
    department,
    position,
    hireDate: row.hire_date,
    probationEndDate: row.probation_end_date,
    employmentStatus: row.employment_status,
    profileComplete: row.position_id !== null && row.hire_date !== null && row.probation_end_date !== null,
    ...access,
  }
}

export function createSupabaseEmployeeRepository(db: UserSupabaseClient): EmployeeRepository {
  const client = db as unknown as EmployeeDataClient

  async function accessFor(companyId: string, employeeIds: string[]) {
    const requestedIds = [...new Set(employeeIds)]
    if (requestedIds.length === 0) return new Map<string, z.infer<typeof accessLinkSchema>>()
    const { data, error } = await client.rpc('get_company_employee_access_links', {
      target_company_id: companyId,
      target_employee_ids: requestedIds,
    })
    const result = z.array(accessLinkSchema).safeParse(data)
    if (error || !result.success) failDatabase('Không thể đọc liên kết tài khoản nhân viên.')
    const returnedIds = new Set<string>()
    for (const link of result.data) {
      if (!requestedIds.includes(link.employee_id) || returnedIds.has(link.employee_id)) {
        failDatabase('Không thể đọc liên kết tài khoản nhân viên.')
      }
      returnedIds.add(link.employee_id)
    }
    return new Map(result.data.map(link => [link.employee_id, link]))
  }

  async function rolesFor(companyId: string, links: Map<string, z.infer<typeof accessLinkSchema>>) {
    const roleCodes = [...new Set([...links.values()].flatMap(link => link.role_codes))]
    if (roleCodes.length === 0) return new Map<string, z.infer<typeof roleRowSchema>>()
    const { data, error } = await client.from('roles')
      .select(roleColumns)
      .eq('company_id', companyId)
      .in('code', roleCodes)
    const result = z.array(roleRowSchema).safeParse(data)
    if (error || !result.success) failDatabase('Không thể đọc vai trò nhân viên.')
    return new Map(result.data.map(role => [role.code, role]))
  }

  async function summaries(companyId: string, data: unknown): Promise<EmployeeSummary[]> {
    const result = z.array(employeeRowSchema).safeParse(data)
    if (!result.success) failDatabase('Không thể đọc danh sách nhân viên.')
    const links = await accessFor(companyId, result.data.map(row => row.id))
    const roles = await rolesFor(companyId, links)
    return result.data.map(row => mapEmployee(row, links.get(row.id), roles))
  }

  async function directoryEmployee(companyId: string, employeeId: string): Promise<EmployeeSummary | null> {
    const { data, error } = await client.from('employees')
      .select(employeeColumns)
      .eq('company_id', companyId)
      .eq('id', employeeId)
      .maybeSingle()
    if (error) failDatabase('Không thể đọc nhân viên.')
    if (data === null) return null
    return (await summaries(companyId, [data]))[0] ?? null
  }

  async function privateDetails(companyId: string, employeeId: string): Promise<EmployeePrivateDetails | null> {
    const { data, error } = await client.from('employee_private_details')
      .select(privateColumns)
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .maybeSingle()
    if (error) failDatabase('Không thể đọc hồ sơ riêng tư của nhân viên.')
    if (data === null) return null
    const result = privateDetailsRowSchema.safeParse(data)
    if (!result.success) failDatabase('Không thể đọc hồ sơ riêng tư của nhân viên.')
    return mapPrivateDetails(result.data)
  }

  return {
    async listDirectory(companyId, page, pageSize) {
      const { data, error, count } = await client.from('employees')
        .select(employeeColumns, { count: 'exact' })
        .eq('company_id', companyId)
        .order('full_name')
        .order('id')
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (error || count === null || count === undefined) failDatabase('Không thể đọc danh sách nhân viên.')
      return { items: await summaries(companyId, data), total: count }
    },
    getDirectoryEmployee: directoryEmployee,
    getPrivateDetails: privateDetails,
    async updateEmployee(companyId, employeeId, input) {
      const update: { [key: string]: UpdateJson } = {}
      if (input.fullName !== undefined) update.fullName = input.fullName
      if (input.workEmail !== undefined) update.workEmail = input.workEmail
      if (input.departmentId !== undefined) update.departmentId = input.departmentId
      if (input.positionId !== undefined) update.positionId = input.positionId
      if (input.managerEmployeeId !== undefined) update.managerEmployeeId = input.managerEmployeeId
      if (input.hireDate !== undefined) update.hireDate = input.hireDate
      if (input.probationEndDate !== undefined) update.probationEndDate = input.probationEndDate
      if (input.employmentStatus !== undefined) update.employmentStatus = input.employmentStatus
      if (input.privateDetails !== undefined) {
        const privateDetails: { [key: string]: UpdateJson } = {}
        if (input.privateDetails.dateOfBirth !== undefined) privateDetails.dateOfBirth = input.privateDetails.dateOfBirth
        if (input.privateDetails.gender !== undefined) privateDetails.gender = input.privateDetails.gender
        if (input.privateDetails.personalEmail !== undefined) privateDetails.personalEmail = input.privateDetails.personalEmail
        if (input.privateDetails.personalPhone !== undefined) privateDetails.personalPhone = input.privateDetails.personalPhone
        if (input.privateDetails.currentAddress !== undefined) privateDetails.currentAddress = input.privateDetails.currentAddress
        if (input.privateDetails.permanentAddress !== undefined) privateDetails.permanentAddress = input.privateDetails.permanentAddress
        if (input.privateDetails.taxCode !== undefined) privateDetails.taxCode = input.privateDetails.taxCode
        if (input.privateDetails.socialInsuranceNumber !== undefined) privateDetails.socialInsuranceNumber = input.privateDetails.socialInsuranceNumber
        if (input.privateDetails.emergencyContactName !== undefined) privateDetails.emergencyContactName = input.privateDetails.emergencyContactName
        if (input.privateDetails.emergencyContactPhone !== undefined) privateDetails.emergencyContactPhone = input.privateDetails.emergencyContactPhone
        update.privateDetails = privateDetails
      }
      const { data, error } = await client.rpc('update_employee_profile', {
        target_company_id: companyId,
        target_employee_id: employeeId,
        target_update: update,
      })
      if (error) return mapUpdateRpcError(error)
      if (!z.string().uuid().safeParse(data).success) failDatabase('Không thể cập nhật nhân viên.')
      return directoryEmployee(companyId, employeeId)
    },
  }
}
