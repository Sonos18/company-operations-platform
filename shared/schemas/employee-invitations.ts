import { z } from 'zod'
import { departmentSummarySchema, positionSummarySchema } from './employees'
export const employeeInvitationOptionsSchema = z.object({
  departments: z.array(departmentSummarySchema),
  positions: z.array(positionSummarySchema),
}).strict()
export const preparedEmployeeInvitationSchema = z.object({
  status: z.literal('prepared'),
  recipient: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
}).strict()
export type PreparedEmployeeInvitation = z.infer<typeof preparedEmployeeInvitationSchema>
export const sentEmployeeInvitationSchema = z.object({
  status: z.literal('sent'),
  recipient: z.string().email(),
  subject: z.string().min(1),
}).strict()
export const manualEmployeeInvitationSchema = preparedEmployeeInvitationSchema.extend({
  delivery: z.enum(['manual', 'failed']),
}).strict()
export const employeeInvitationResultSchema = z.discriminatedUnion('status', [
  sentEmployeeInvitationSchema,
  manualEmployeeInvitationSchema,
])
export type EmployeeInvitationResult = z.infer<typeof employeeInvitationResultSchema>
