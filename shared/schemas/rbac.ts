import { z } from 'zod'
import { permissionCodes } from '../constants/permissions'

export const permissionCodeSchema = z.enum(permissionCodes)

export const roleSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  isPrivileged: z.boolean(),
  isSystem: z.boolean(),
  permissions: z.array(permissionCodeSchema).optional(),
}).strict()
export type RoleSummary = z.infer<typeof roleSummarySchema>

export const roleAssignmentInputSchema = z.object({
  targetUserId: z.string().uuid(),
  roleId: z.string().uuid(),
  reason: z.string().trim().min(1),
}).strict()
export type RoleAssignmentInput = z.infer<typeof roleAssignmentInputSchema>

export const roleAssignmentRevokeInputSchema = z.object({
  reason: z.string().trim().min(1),
}).strict()
export type RoleAssignmentRevokeInput = z.infer<typeof roleAssignmentRevokeInputSchema>

export const roleAssignmentResultSchema = z.object({
  id: z.number().int().positive(),
  targetUserId: z.string().uuid(),
  roleId: z.string().uuid(),
}).strict()
export type RoleAssignmentResult = z.infer<typeof roleAssignmentResultSchema>
