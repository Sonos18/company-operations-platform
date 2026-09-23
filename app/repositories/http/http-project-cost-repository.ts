import { z } from 'zod'
import {
  correctPublishedProjectCostInputSchema,
  costCommandAckSchema,
  createProjectCostDraftInputSchema,
  prepareProjectCostFinancialsInputSchema,
  prepareProjectCostFinancialsResultSchema,
  projectCostBreakdownSchema,
  projectCostDetailsResponseSchema,
  projectCostDraftSchema,
  projectCostOperationalDraftSchema,
  projectCostSummaryEntrySchema,
  publishProjectCostInputSchema,
  updateProjectCostDraftInputSchema,
} from '../../../shared/schemas/costs/project-costs'
import type {
  CorrectPublishedProjectCostInput,
  ProjectCostCreateDraft,
  ProjectCostCreateResult,
  ProjectCostMutationResult,
  ProjectCostPatchInput,
  ProjectCostRepository,
  ProjectCostSummaryEntry,
  PublishProjectCostInput,
} from '../contracts'
import type {
  CostCommandAck,
  ProjectCostDetailsResponse,
  ProjectCostDraft,
  ProjectCostOperationalDraft,
} from '../../../shared/schemas/costs/project-costs'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export function createHttpProjectCostRepository(options: { companyId: string | (() => string); client: AuthenticatedHttpClient; createIdempotencyKey?: () => string }): ProjectCostRepository {
  const company = () => encodeURIComponent(typeof options.companyId === 'function' ? options.companyId() : options.companyId)
  const id = (value: string) => encodeURIComponent(value)
  const base = () => `/api/companies/${company()}`
  const parsePatch = (input: ProjectCostPatchInput) => updateProjectCostDraftInputSchema.parse(input)
  const nextIdempotencyKey = () => (options.createIdempotencyKey ?? (() => globalThis.crypto.randomUUID()))()

  return {
    summaries: (): Promise<ProjectCostSummaryEntry[]> => options.client.request({ url: `${base()}/project-costs`, method: 'GET', schema: z.array(projectCostSummaryEntrySchema) }),
    project: projectId => options.client.request({ url: `${base()}/projects/${id(projectId)}/project-costs`, method: 'GET', schema: projectCostBreakdownSchema }),
    details: (projectCostItemId: string): Promise<ProjectCostDetailsResponse> => options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}/details`, method: 'GET', schema: projectCostDetailsResponseSchema }),
    create: (projectId: string, input: ProjectCostCreateDraft): Promise<ProjectCostCreateResult> => {
      const body = createProjectCostDraftInputSchema.parse({ ...input, projectId })
      return options.client.request({ url: `${base()}/projects/${id(projectId)}/project-costs`, method: 'POST', body, idempotencyKey: nextIdempotencyKey(), schema: costCommandAckSchema })
    },
    update: (projectCostItemId: string, input: ProjectCostPatchInput): Promise<ProjectCostMutationResult> => options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}`, method: 'PATCH', body: parsePatch(input), schema: costCommandAckSchema }),
    prepareFinancials: (projectCostItemId, input) => options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}/financials`, method: 'PUT', body: prepareProjectCostFinancialsInputSchema.parse(input), schema: prepareProjectCostFinancialsResultSchema }),
    draft: (projectCostItemId: string): Promise<ProjectCostDraft> => options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}/draft`, method: 'GET', schema: projectCostDraftSchema }),
    listDrafts: (projectId: string): Promise<ProjectCostDraft[]> => options.client.request({ url: `${base()}/projects/${id(projectId)}/project-cost-drafts`, method: 'GET', schema: z.array(projectCostDraftSchema) }),
    operationalDraft: (projectCostItemId: string): Promise<ProjectCostOperationalDraft> => options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}/draft/operations`, method: 'GET', schema: projectCostOperationalDraftSchema }),
    listOperationalDrafts: (projectId: string): Promise<ProjectCostOperationalDraft[]> => options.client.request({ url: `${base()}/projects/${id(projectId)}/project-cost-drafts/operations`, method: 'GET', schema: z.array(projectCostOperationalDraftSchema) }),
    publish: (projectCostItemId: string, input: PublishProjectCostInput): Promise<CostCommandAck> => {
      const body = publishProjectCostInputSchema.parse(input)
      return options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}/publish`, method: 'POST', body, idempotencyKey: nextIdempotencyKey(), schema: costCommandAckSchema })
    },
    correct: (projectCostItemId: string, input: CorrectPublishedProjectCostInput): Promise<CostCommandAck> => {
      const body = correctPublishedProjectCostInputSchema.parse(input)
      return options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}/corrections`, method: 'POST', body, idempotencyKey: nextIdempotencyKey(), schema: costCommandAckSchema })
    },
  }
}
