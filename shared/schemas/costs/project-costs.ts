import Decimal from 'decimal.js'
import { z } from 'zod'
import { decimalStringSchema } from './master-data'

const uuid = z.string().uuid()
const text = z.string().trim().min(1)
const version = z.number().int().nonnegative()
const currencyCode = z.string().trim().length(3)
const relevantDate = z.string().date()

export const projectCostWorkStatusSchema = z.enum(['unknown', 'in_progress', 'accepted'])

const projectCostItemFieldsSchema = z.object({
  description: text,
  amount: decimalStringSchema,
  currencyCode,
  workStatus: projectCostWorkStatusSchema,
  businessReference: text.nullable().optional(),
  partyId: uuid.optional(),
  engagementId: uuid.optional(),
  componentId: uuid.optional(),
  relevantDate: relevantDate.optional(),
})

export const createProjectCostItemInputSchema = projectCostItemFieldsSchema.extend({ projectId: uuid }).strict()
export const updateProjectCostItemInputSchema = projectCostItemFieldsSchema.partial().extend({ expectedVersion: version }).strict()

const timestamp = z.string().datetime()
export const projectCostItemSchema = z.object({
  id: uuid,
  tenantId: uuid,
  companyId: uuid,
  projectId: uuid,
  description: text,
  amount: decimalStringSchema,
  currencyCode,
  workStatus: projectCostWorkStatusSchema,
  businessReference: text.nullable(),
  partyId: uuid.nullable(),
  engagementId: uuid.nullable(),
  componentId: uuid.nullable(),
  relevantDate: relevantDate.nullable(),
  version,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()

export const projectCostSummarySchema = z.object({
  acceptedValue: decimalStringSchema,
  acceptedCount: z.number().int().nonnegative(),
  inProgressValue: decimalStringSchema,
  inProgressCount: z.number().int().nonnegative(),
  unknownStatusValue: decimalStringSchema,
  unknownCount: z.number().int().nonnegative(),
  totalTrackedWorkValue: decimalStringSchema,
}).strict().superRefine((value, context) => {
  if (!new Decimal(value.acceptedValue).plus(value.inProgressValue).eq(value.totalTrackedWorkValue)) {
    context.addIssue({ code: 'custom', path: ['totalTrackedWorkValue'], message: 'must equal acceptedValue plus inProgressValue' })
  }
})

export const projectCostBreakdownSchema = z.object({
  projectId: uuid,
  summary: projectCostSummarySchema,
  items: z.array(projectCostItemSchema),
}).strict()

export type ProjectCostWorkStatus = z.infer<typeof projectCostWorkStatusSchema>
export type CreateProjectCostItemInput = z.infer<typeof createProjectCostItemInputSchema>
export type UpdateProjectCostItemInput = z.infer<typeof updateProjectCostItemInputSchema>
export type ProjectCostItem = z.infer<typeof projectCostItemSchema>
export type ProjectCostSummary = z.infer<typeof projectCostSummarySchema>
export type ProjectCostBreakdown = z.infer<typeof projectCostBreakdownSchema>
