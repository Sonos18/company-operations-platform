import type {
  EmployeeDetail,
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
  ): Promise<EmployeeDetail | null>
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
  update(values: Record<string, string | null>): Query
  maybeSingle(): Promise<QueryResult>
}

interface EmployeeDataClient {
  from(table: 'employees' | 'employee_private_details' | 'roles'): Query
  rpc(
    functionName: 'get_company_employee_access_links',
    arguments_: { target_company_id: string, target_employee_ids: string[] },
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
  role_codes: z.array(z.string().trim().min(1)),
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
  const roles = link?.role_codes.map(code => rolesByCode.get(code)).filter(
    (role): role is z.infer<typeof roleRowSchema> => role !== undefined,
  )
  const access = link && roles && roles.length === link.role_codes.length
    ? {
        account: { email: row.work_email, userId: link.user_id },
        roles: roles.map(role => ({
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
          isPrivileged: role.is_privileged,
          isSystem: role.is_system,
        })),
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
    if (employeeIds.length === 0) return new Map<string, z.infer<typeof accessLinkSchema>>()
    const { data, error } = await client.rpc('get_company_employee_access_links', {
      target_company_id: companyId,
      target_employee_ids: employeeIds,
    })
    const result = z.array(accessLinkSchema).safeParse(data)
    if (error || !result.success) failDatabase('Không thể đọc liên kết tài khoản nhân viên.')
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
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (error || count === null || count === undefined) failDatabase('Không thể đọc danh sách nhân viên.')
      return { items: await summaries(companyId, data), total: count }
    },
    getDirectoryEmployee: directoryEmployee,
    getPrivateDetails: privateDetails,
    async updateEmployee(companyId, employeeId, input) {
      const employeeUpdate: Record<string, string | null> = {}
      if (input.fullName !== undefined) employeeUpdate.full_name = input.fullName
      if (input.workEmail !== undefined) employeeUpdate.work_email = input.workEmail
      if (input.departmentId !== undefined) employeeUpdate.department_id = input.departmentId
      if (input.positionId !== undefined) employeeUpdate.position_id = input.positionId
      if (input.managerEmployeeId !== undefined) employeeUpdate.manager_employee_id = input.managerEmployeeId
      if (input.hireDate !== undefined) employeeUpdate.hire_date = input.hireDate
      if (input.probationEndDate !== undefined) employeeUpdate.probation_end_date = input.probationEndDate
      if (input.employmentStatus !== undefined) employeeUpdate.employment_status = input.employmentStatus
      if (Object.keys(employeeUpdate).length > 0) {
        const { error } = await client.from('employees')
          .update(employeeUpdate)
          .eq('company_id', companyId)
          .eq('id', employeeId)
        if (error) failDatabase('Không thể cập nhật nhân viên.')
      }
      if (input.privateDetails) {
        const privateUpdate: Record<string, string | null> = {}
        if (input.privateDetails.dateOfBirth !== undefined) privateUpdate.date_of_birth = input.privateDetails.dateOfBirth
        if (input.privateDetails.gender !== undefined) privateUpdate.gender = input.privateDetails.gender
        if (input.privateDetails.personalEmail !== undefined) privateUpdate.personal_email = input.privateDetails.personalEmail
        if (input.privateDetails.personalPhone !== undefined) privateUpdate.personal_phone = input.privateDetails.personalPhone
        if (input.privateDetails.currentAddress !== undefined) privateUpdate.current_address = input.privateDetails.currentAddress
        if (input.privateDetails.permanentAddress !== undefined) privateUpdate.permanent_address = input.privateDetails.permanentAddress
        if (input.privateDetails.taxCode !== undefined) privateUpdate.tax_code = input.privateDetails.taxCode
        if (input.privateDetails.socialInsuranceNumber !== undefined) privateUpdate.social_insurance_number = input.privateDetails.socialInsuranceNumber
        if (input.privateDetails.emergencyContactName !== undefined) privateUpdate.emergency_contact_name = input.privateDetails.emergencyContactName
        if (input.privateDetails.emergencyContactPhone !== undefined) privateUpdate.emergency_contact_phone = input.privateDetails.emergencyContactPhone
        const { error } = await client.from('employee_private_details')
          .update(privateUpdate)
          .eq('company_id', companyId)
          .eq('employee_id', employeeId)
        if (error) failDatabase('Không thể cập nhật hồ sơ riêng tư của nhân viên.')
      }
      const employee = await directoryEmployee(companyId, employeeId)
      if (!employee) return null
      const details = await privateDetails(companyId, employeeId)
      return details ? { ...employee, privateDetails: details } : employee
    },
  }
}
