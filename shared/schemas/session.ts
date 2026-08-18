import { z } from 'zod'
import { permissionCodeSchema } from './rbac'

const deduplicatedStringArraySchema = z.array(z.string().trim().min(1)).transform(
  values => [...new Set(values)],
)
const deduplicatedPermissionArraySchema = z.array(permissionCodeSchema).transform(
  values => [...new Set(values)],
)

export const companyAccessSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  companyCode: z.string().min(1),
  companyName: z.string().min(1),
  // Normalized active role assignments are display context only; callers must
  // use permissions for authorization rather than legacy membership arrays.
  roles: deduplicatedStringArraySchema,
  permissions: deduplicatedPermissionArraySchema,
}).strict()
export type CompanyAccess = z.infer<typeof companyAccessSchema>

export const sessionResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().email().nullable(),
  }).strict(),
  companies: z.array(companyAccessSchema),
}).strict()

export const companyRequestContextSchema = companyAccessSchema.pick({
  tenantId: true,
  companyId: true,
  roles: true,
  permissions: true,
})
export type CompanyRequestContext = z.infer<typeof companyRequestContextSchema>
