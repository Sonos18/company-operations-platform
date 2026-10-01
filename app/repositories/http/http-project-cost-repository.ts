import { z } from 'zod'
import {
  correctPublishedProjectCostDetailInputSchema,
  correctPublishedProjectCostInputSchema,
  createAndPublishProjectCostDetailInputSchema,
  createProjectCostDetailDraftInputSchema,
  costCommandAckSchema,
  prepareProjectCostDetailFinancialsInputSchema,
  projectCostDetailCommandAckSchema,
  projectCostDetailDraftSchema,
  projectCostDetailOperationalDraftSchema,
  projectCostBreakdownSchema,
  projectCostDetailsResponseSchema,
  projectCostDraftManagementMetadataSchema,
  projectCostSummaryEntrySchema,
  publishProjectCostDetailInputSchema,
  updateProjectCostDetailDraftInputSchema,
} from '../../../shared/schemas/costs/project-costs'
import type {
  CorrectPublishedProjectCostInput,
  ProjectCostRepository,
  ProjectCostSummaryEntry,
} from '../contracts'
import type {
  CostCommandAck,
  ProjectCostDetailsResponse,
} from '../../../shared/schemas/costs/project-costs'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export function createHttpProjectCostRepository(options: { companyId: string | (() => string); client: AuthenticatedHttpClient }): ProjectCostRepository {
  const company = () => encodeURIComponent(typeof options.companyId === 'function' ? options.companyId() : options.companyId)
  const id = (value: string) => encodeURIComponent(value)
  const base = () => `/api/companies/${company()}`

  return {
    summaries: (): Promise<ProjectCostSummaryEntry[]> => options.client.request({ url: `${base()}/project-costs`, method: 'GET', schema: z.array(projectCostSummaryEntrySchema) }),
    project: projectId => options.client.request({ url: `${base()}/projects/${id(projectId)}/project-costs`, method: 'GET', schema: projectCostBreakdownSchema }),
    draftManagementMetadata: () => options.client.request({ url: `${base()}/project-cost-drafts/metadata`, method: 'GET', schema: projectCostDraftManagementMetadataSchema }),
    details: (projectCostItemId: string): Promise<ProjectCostDetailsResponse> => options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}/details`, method: 'GET', schema: projectCostDetailsResponseSchema }),
    correct: (projectCostItemId: string, input: CorrectPublishedProjectCostInput, command: { idempotencyKey: string }): Promise<CostCommandAck> => {
      const body = correctPublishedProjectCostInputSchema.parse(input)
      return options.client.request({ url: `${base()}/project-costs/${id(projectCostItemId)}/corrections`, method: 'POST', body, idempotencyKey: command.idempotencyKey, schema: costCommandAckSchema })
    },
    createDetailDraft: (projectId, input, command) => {
      const body = createProjectCostDetailDraftInputSchema.parse(input)
      return options.client.request({ url: `${base()}/projects/${id(projectId)}/cost-entry-drafts`, method: 'POST', body, idempotencyKey: command.idempotencyKey, schema: projectCostDetailCommandAckSchema })
    },
    updateDetailDraft: (detailId, input) => options.client.request({ url: `${base()}/project-cost-details/${id(detailId)}`, method: 'PATCH', body: updateProjectCostDetailDraftInputSchema.parse(input), schema: projectCostDetailCommandAckSchema }),
    prepareDetailFinancials: (detailId, input) => options.client.request({ url: `${base()}/project-cost-details/${id(detailId)}/financials`, method: 'PUT', body: prepareProjectCostDetailFinancialsInputSchema.parse(input), schema: projectCostDetailCommandAckSchema }),
    detailDraft: detailId => options.client.request({ url: `${base()}/project-cost-details/${id(detailId)}/draft`, method: 'GET', schema: projectCostDetailDraftSchema }),
    listDetailDrafts: projectId => options.client.request({ url: `${base()}/projects/${id(projectId)}/cost-entry-drafts`, method: 'GET', schema: z.array(projectCostDetailDraftSchema) }),
    operationalDetailDraft: detailId => options.client.request({ url: `${base()}/project-cost-details/${id(detailId)}/draft/operations`, method: 'GET', schema: projectCostDetailOperationalDraftSchema }),
    listOperationalDetailDrafts: projectId => options.client.request({ url: `${base()}/projects/${id(projectId)}/cost-entry-drafts/operations`, method: 'GET', schema: z.array(projectCostDetailOperationalDraftSchema) }),
    publishDetail: (detailId, input, command) => options.client.request({ url: `${base()}/project-cost-details/${id(detailId)}/publish`, method: 'POST', body: publishProjectCostDetailInputSchema.parse(input), idempotencyKey: command.idempotencyKey, schema: projectCostDetailCommandAckSchema }),
    createAndPublishDetail: (projectId, input, command) => {
      const body = createAndPublishProjectCostDetailInputSchema.parse(input)
      return options.client.request({ url: `${base()}/projects/${id(projectId)}/cost-entries`, method: 'POST', body, idempotencyKey: command.idempotencyKey, schema: projectCostDetailCommandAckSchema })
    },
    correctPublishedDetail: (detailId, input, command) => options.client.request({ url: `${base()}/project-cost-details/${id(detailId)}/corrections`, method: 'POST', body: correctPublishedProjectCostDetailInputSchema.parse(input), idempotencyKey: command.idempotencyKey, schema: projectCostDetailCommandAckSchema }),
  }
}
