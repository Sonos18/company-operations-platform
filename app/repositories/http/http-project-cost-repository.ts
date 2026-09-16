import { z } from 'zod'
import { correctProjectCostItemInputSchema, createProjectCostItemInputSchema, projectCostBreakdownSchema, projectCostSummarySchema, updateProjectCostItemInputSchema } from '../../../shared/schemas/costs/project-costs'
import type { ProjectCostCreateDraft, ProjectCostCreateResult, ProjectCostMutationResult, ProjectCostPatchInput, ProjectCostRepository, ProjectCostSummaryEntry } from '../contracts'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

const summaryEntrySchema = z.object({ projectId: z.string().uuid(), summary: projectCostSummarySchema }).strict()
const createAcknowledgementSchema = z.object({ id: z.string().uuid(), version: z.number().int().nonnegative(), replayed: z.boolean() }).strict()
const mutationAcknowledgementSchema = z.object({ id: z.string().uuid(), version: z.number().int().nonnegative() }).strict()

export function createHttpProjectCostRepository(options: { companyId: string | (() => string); client: AuthenticatedHttpClient; createIdempotencyKey?: () => string }): ProjectCostRepository {
  const company = () => encodeURIComponent(typeof options.companyId === 'function' ? options.companyId() : options.companyId)
  const id = (value: string) => encodeURIComponent(value)
  const base = () => `/api/companies/${company()}`
  const parsePatch = (input: ProjectCostPatchInput) => {
    const update = updateProjectCostItemInputSchema.safeParse(input)
    if (update.success) return update.data
    return correctProjectCostItemInputSchema.parse(input)
  }
  return {
    summaries: (): Promise<ProjectCostSummaryEntry[]> => options.client.request({ url: `${base()}/project-costs`, method: 'GET', schema: z.array(summaryEntrySchema) }),
    project: projectId => options.client.request({ url: `${base()}/projects/${id(projectId)}/project-costs`, method: 'GET', schema: projectCostBreakdownSchema }),
    create: (projectId: string, input: ProjectCostCreateDraft): Promise<ProjectCostCreateResult> => {
      const body = createProjectCostItemInputSchema.parse({ ...input, projectId })
      const idempotencyKey = (options.createIdempotencyKey ?? (() => globalThis.crypto.randomUUID()))()
      return options.client.request({ url: `${base()}/projects/${id(projectId)}/project-costs`, method: 'POST', body, idempotencyKey, schema: createAcknowledgementSchema })
    },
    update: (projectCostItemId: string, input: ProjectCostPatchInput): Promise<ProjectCostMutationResult> => options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}`, method: 'PATCH', body: parsePatch(input), schema: mutationAcknowledgementSchema }),
  }
}
