import { z } from 'zod'

export const apiErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'AUTH_INVALID',
  'COMPANY_CONTEXT_REQUIRED',
  'COMPANY_FORBIDDEN',
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
