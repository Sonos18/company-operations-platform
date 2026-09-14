import { z } from 'zod'

const uuid = z.string().uuid()
const decimal = z.string().regex(/^-?\d{1,16}(?:\.\d{1,4})?$/)
const locator = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cell_range'), sheetName: z.string(), range: z.string() }).strict(),
  z.object({ kind: z.literal('logical_section'), section: z.string() }).strict(),
  z.object({ kind: z.literal('whole_file'), note: z.string().optional() }).strict(),
])
const mappingState = z.enum(['confirmed', 'pending', 'reference_only', 'excluded'])
const valueState = z.enum(['known', 'blank', 'formula_error', 'missing_cached', 'not_numeric'])
const basis = z.enum(['net', 'gross', 'payable_basis', 'cash', 'mixed', 'unknown'])
const scopeKind = z.enum(['subcontractors_only', 'whole_project', 'mixed', 'unknown'])
const confirmation = z.enum(['unverified', 'confirmed_external', 'disputed'])

const source = z.object({ id: uuid, code: z.string(), title: z.string(), sourceSystem: z.string() }).strict()
const version = z.object({ id: uuid, versionNo: z.number().int().positive() }).strict()
const hierarchyItem = z.object({ id: uuid, code: z.string(), name: z.string() }).strict()
const contractor = z.object({ id: uuid, code: z.string(), displayName: z.string() }).strict()

export const costSourceFigureSchema = z.object({
  id: uuid, label: z.string(), rawValueText: z.string(), valueState, amountText: decimal.nullable(), currencyCode: z.string().length(3).nullable(),
  basis, scopeKind, scopeDescription: z.string(), confirmation, observedAt: z.string().datetime(),
  mapping: z.object({ state: mappingState, projectId: uuid.nullable(), engagementId: uuid.nullable(), contractorId: uuid.nullable() }).strict(),
  source, version, locator,
}).strict()

export const costSourceFigurePageSchema = z.object({ items: z.array(costSourceFigureSchema), nextCursor: uuid.nullable() }).strict()
export const costSourceOverviewSchema = z.object({
  projects: z.array(z.object({ project: hierarchyItem, engagements: z.array(z.object({ engagement: hierarchyItem, contractor: contractor.nullable(), figureCount: z.number().int().nonnegative() }).strict()), sourceCount: z.number().int().nonnegative(), figureCount: z.number().int().nonnegative(), latestObservedAt: z.string().datetime().nullable(), openIssueCount: z.number().int().nonnegative(), mappingState: mappingState }).strict()),
  unassigned: z.object({ sourceCount: z.number().int().nonnegative(), figureCount: z.number().int().nonnegative(), latestObservedAt: z.string().datetime().nullable() }).strict(),
  sourceCount: z.number().int().nonnegative(), figureCount: z.number().int().nonnegative(), openIssueCount: z.number().int().nonnegative(),
}).strict()
export const costSourceProjectDetailSchema = z.object({ project: hierarchyItem.nullable(), engagements: z.array(z.object({ engagement: hierarchyItem, contractor: contractor.nullable(), figureCount: z.number().int().nonnegative(), latestObservedAt: z.string().datetime().nullable() }).strict()) }).strict()
export const costSourceProvenanceSchema = z.object({
  figure: costSourceFigureSchema, originalFilename: z.string(), hierarchy: z.object({ project: hierarchyItem.nullable(), engagement: hierarchyItem.nullable(), contractor: contractor.nullable() }).strict(),
  openIssues: z.array(z.object({ issueKind: z.string(), impact: z.string(), description: z.string() }).strict()), duplicateWarning: z.boolean(),
}).strict()

export const costSourceFiguresQuerySchema = z.object({
  cursor: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).default(25), projectId: uuid.optional(), sourceId: uuid.optional(), mappingState: mappingState.optional(), confirmation: confirmation.optional(), engagementId: uuid.optional(), search: z.string().trim().min(1).max(120).optional(),
}).strict()

export type CostSourceFigure = z.infer<typeof costSourceFigureSchema>
export type CostSourceFiguresQuery = z.infer<typeof costSourceFiguresQuerySchema>
export type CostSourceOverview = z.infer<typeof costSourceOverviewSchema>
export type CostSourceProjectDetail = z.infer<typeof costSourceProjectDetailSchema>
export type CostSourceProvenance = z.infer<typeof costSourceProvenanceSchema>
