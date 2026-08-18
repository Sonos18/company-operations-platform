import { z } from 'zod'

export const apiErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'AUTH_INVALID',
  'COMPANY_CONTEXT_REQUIRED',
  'COMPANY_FORBIDDEN',
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
  'INTERNAL_ERROR',
])
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(1),
    details: z.record(z.string(), z.unknown()),
  }),
})
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
