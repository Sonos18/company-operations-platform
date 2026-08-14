import { z } from 'zod'

export const companyAccessSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  companyCode: z.string().min(1),
  companyName: z.string().min(1),
  roles: z.array(z.string().min(1)).min(1),
})
export type CompanyAccess = z.infer<typeof companyAccessSchema>

export const sessionResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().email().nullable(),
  }),
  companies: z.array(companyAccessSchema),
})

export const companyRequestContextSchema = companyAccessSchema.pick({
  tenantId: true,
  companyId: true,
  roles: true,
})
export type CompanyRequestContext = z.infer<typeof companyRequestContextSchema>
