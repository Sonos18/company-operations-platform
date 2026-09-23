import { z } from 'zod'
import { costCommandAckSchema, createProjectCostDraftInputSchema, prepareProjectCostFinancialsInputSchema, prepareProjectCostFinancialsResultSchema, projectCostBreakdownSchema, projectCostDetailsResponseSchema, projectCostDraftSchema, projectCostSummaryEntrySchema, updateProjectCostDraftInputSchema } from '../../../shared/schemas/costs/project-costs'
import type { ProjectCostCreateDraft, ProjectCostCreateResult, ProjectCostMutationResult, ProjectCostPatchInput, ProjectCostRepository, ProjectCostSummaryEntry } from '../contracts'
import type { ProjectCostDetailsResponse } from '../../../shared/schemas/costs/project-costs'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export function createHttpProjectCostRepository(options: { companyId: string | (() => string); client: AuthenticatedHttpClient; createIdempotencyKey?: () => string }): ProjectCostRepository {
  const company = () => encodeURIComponent(typeof options.companyId === 'function' ? options.companyId() : options.companyId)
  const id = (value: string) => encodeURIComponent(value)
  const base = () => `/api/companies/${company()}`
  const parsePatch = (input: ProjectCostPatchInput) => updateProjectCostDraftInputSchema.parse(input)
  return {
    summaries: (): Promise<ProjectCostSummaryEntry[]> => options.client.request({ url: `${base()}/project-costs`, method: 'GET', schema: z.array(projectCostSummaryEntrySchema) }),
    project: projectId => options.client.request({ url: `${base()}/projects/${id(projectId)}/project-costs`, method: 'GET', schema: projectCostBreakdownSchema }),
    details: (projectCostItemId: string): Promise<ProjectCostDetailsResponse> => options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}/details`, method: 'GET', schema: projectCostDetailsResponseSchema }),
    create: (projectId: string, input: ProjectCostCreateDraft): Promise<ProjectCostCreateResult> => {
      const body = createProjectCostDraftInputSchema.parse({ ...input, projectId })
      const idempotencyKey = (options.createIdempotencyKey ?? (() => globalThis.crypto.randomUUID()))()
      return options.client.request({ url: `${base()}/projects/${id(projectId)}/project-costs`, method: 'POST', body, idempotencyKey, schema: costCommandAckSchema })
    },
    update: (projectCostItemId: string, input: ProjectCostPatchInput): Promise<ProjectCostMutationResult> => options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}`, method: 'PATCH', body: parsePatch(input), schema: costCommandAckSchema }),
    prepareFinancials: (projectCostItemId, input) => options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}/financials`, method: 'PUT', body: prepareProjectCostFinancialsInputSchema.parse(input), schema: prepareProjectCostFinancialsResultSchema }),
    draft: projectCostItemId => options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}/draft`, method: 'GET', schema: projectCostDraftSchema }),
    listDrafts: projectId => options.client.request({ url: `${base()}/projects/${id(projectId)}/project-cost-drafts`, method: 'GET', schema: z.array(projectCostDraftSchema) }),
  }
}
