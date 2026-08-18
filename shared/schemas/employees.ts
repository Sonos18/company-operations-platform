import { z } from 'zod'
import { roleSummarySchema } from './rbac'

const uuidSchema = z.string().uuid()
const dateSchema = z.string().date()
const nullableDateSchema = dateSchema.nullable()
const normalizedEmailSchema = z.string().trim().toLowerCase().email()

export const employmentStatusSchema = z.enum([
  'probation',
  'active',
  'on_leave',
  'terminated',
])
export type EmploymentStatus = z.infer<typeof employmentStatusSchema>

export const departmentSummarySchema = z.object({
  id: uuidSchema,
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
}).strict()
export type DepartmentSummary = z.infer<typeof departmentSummarySchema>

export const positionSummarySchema = z.object({
  id: uuidSchema,
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  level: z.number().int().positive().nullable(),
}).strict()
export type PositionSummary = z.infer<typeof positionSummarySchema>

export const employeeAccountSchema = z.object({
  email: normalizedEmailSchema,
  userId: uuidSchema.optional(),
}).strict()
export type EmployeeAccount = z.infer<typeof employeeAccountSchema>

export const employeePrivateDetailsSchema = z.object({
  dateOfBirth: nullableDateSchema,
  gender: z.enum(['female', 'male', 'other', 'undisclosed']).nullable(),
  personalEmail: normalizedEmailSchema.nullable(),
  personalPhone: z.string().trim().min(1).nullable(),
  currentAddress: z.string().trim().min(1).nullable(),
  permanentAddress: z.string().trim().min(1).nullable(),
  taxCode: z.string().trim().min(1).nullable(),
  socialInsuranceNumber: z.string().trim().min(1).nullable(),
  emergencyContactName: z.string().trim().min(1).nullable(),
  emergencyContactPhone: z.string().trim().min(1).nullable(),
}).strict()
export type EmployeePrivateDetails = z.infer<typeof employeePrivateDetailsSchema>

export const employeeSummarySchema = z.object({
  id: uuidSchema,
  employeeCode: z.string().trim().min(1),
  fullName: z.string().trim().min(1),
  workEmail: normalizedEmailSchema,
  account: employeeAccountSchema.optional(),
  department: departmentSummarySchema,
  position: positionSummarySchema.nullable(),
  hireDate: nullableDateSchema,
  probationEndDate: nullableDateSchema,
  employmentStatus: employmentStatusSchema,
  profileComplete: z.boolean(),
  roles: z.array(roleSummarySchema).min(1).optional(),
}).strict().refine(
  employee => (employee.account === undefined) === (employee.roles === undefined),
  'Account and roles must be provided together or redacted together.',
)
export type EmployeeSummary = z.infer<typeof employeeSummarySchema>

export const employeeDetailSchema = employeeSummarySchema.extend({
  privateDetails: employeePrivateDetailsSchema.optional(),
}).strict()
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>

export const employeeInvitationInputSchema = z.object({
  employeeCode: z.string().trim().min(1),
  fullName: z.string().trim().min(1),
  workEmail: normalizedEmailSchema,
  departmentId: uuidSchema,
  positionId: uuidSchema.optional(),
  hireDate: dateSchema.optional(),
}).strict()
export type EmployeeInvitationInput = z.infer<typeof employeeInvitationInputSchema>

const employeePrivateDetailsUpdateSchema = employeePrivateDetailsSchema.partial().refine(
  details => Object.keys(details).length > 0,
  'At least one private detail must be supplied.',
)

export const employeeUpdateInputSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  workEmail: normalizedEmailSchema.optional(),
  departmentId: uuidSchema.optional(),
  positionId: uuidSchema.nullable().optional(),
  managerEmployeeId: uuidSchema.nullable().optional(),
  hireDate: nullableDateSchema.optional(),
  probationEndDate: nullableDateSchema.optional(),
  employmentStatus: employmentStatusSchema.optional(),
  privateDetails: employeePrivateDetailsUpdateSchema.optional(),
}).strict().refine(
  update => Object.keys(update).length > 0,
  'At least one employee field must be supplied.',
)
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateInputSchema>

export const employeeOffboardingInputSchema = z.object({
  reason: z.string().trim().min(1),
}).strict()
export type EmployeeOffboardingInput = z.infer<typeof employeeOffboardingInputSchema>

export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict()
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>

export const employeeListResponseSchema = z.object({
  items: z.array(employeeSummarySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
}).strict()
export type EmployeeListResponse = z.infer<typeof employeeListResponseSchema>
