import { z } from 'zod'
import {
  costEvidenceCreateIntentInputSchema,
  costEvidenceDetailLinkInputSchema,
  costEvidenceDetailLinkResultSchema,
  costEvidenceFinalizeInputSchema,
  costEvidenceFinalizedSchema,
  costEvidenceLinkInputSchema,
  costEvidenceLinkResultSchema,
  costEvidenceMetadataSchema,
  costEvidenceReadUrlInputSchema,
  costEvidenceReadUrlSchema,
  costEvidenceUploadIntentSchema,
  type CostEvidenceCreateIntentInput,
  type CostEvidenceDetailLinkInput,
  type CostEvidenceDetailLinkResult,
  type CostEvidenceFinalizeInput,
  type CostEvidenceFinalized,
  type CostEvidenceLinkInput,
  type CostEvidenceLinkResult,
  type CostEvidenceMetadata,
  type CostEvidenceReadUrl,
  type CostEvidenceReadUrlInput,
  type CostEvidenceUploadIntent,
} from '../../../shared/schemas/costs/cost-evidence'
import type { CostEvidenceRepository } from '../contracts'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export function createHttpCostEvidenceRepository(options: {
  companyId: string | (() => string)
  client: AuthenticatedHttpClient
}): CostEvidenceRepository {
  const company = () => encodeURIComponent(typeof options.companyId === 'function' ? options.companyId() : options.companyId)
  const id = (value: string) => encodeURIComponent(value)
  const base = () => `/api/companies/${company()}`

  return {
    createUploadIntent: (projectId: string, input: CostEvidenceCreateIntentInput, command: { idempotencyKey: string }): Promise<CostEvidenceUploadIntent> => {
      const body = costEvidenceCreateIntentInputSchema.parse(input)
      return options.client.request({
        url: `${base()}/projects/${id(projectId)}/evidence/upload-intents`,
        method: 'POST',
        body,
        idempotencyKey: command.idempotencyKey,
        schema: costEvidenceUploadIntentSchema,
      })
    },
    finalize: (evidenceFileId: string, input: CostEvidenceFinalizeInput, command: { idempotencyKey: string }): Promise<CostEvidenceFinalized> => {
      const body = costEvidenceFinalizeInputSchema.parse(input)
      return options.client.request({
        url: `${base()}/evidence-files/${id(evidenceFileId)}/finalize`,
        method: 'POST',
        body,
        idempotencyKey: command.idempotencyKey,
        schema: costEvidenceFinalizedSchema,
      })
    },
    link: (projectCostItemId: string, input: CostEvidenceLinkInput, command: { idempotencyKey: string }): Promise<CostEvidenceLinkResult> => {
      const body = costEvidenceLinkInputSchema.parse(input)
      return options.client.request({
        url: `${base()}/project-costs/${id(projectCostItemId)}/evidence`,
        method: 'POST',
        body,
        idempotencyKey: command.idempotencyKey,
        schema: costEvidenceLinkResultSchema,
      })
    },
    listMetadata: (projectCostItemId: string): Promise<CostEvidenceMetadata[]> => {
      return options.client.request({
        url: `${base()}/project-costs/${id(projectCostItemId)}/evidence`,
        method: 'GET',
        schema: z.array(costEvidenceMetadataSchema),
      })
    },
    linkDetail: (detailId: string, input: CostEvidenceDetailLinkInput, command: { idempotencyKey: string }): Promise<CostEvidenceDetailLinkResult> => {
      const body = costEvidenceDetailLinkInputSchema.parse(input)
      return options.client.request({ url: `${base()}/project-cost-details/${id(detailId)}/evidence`, method: 'POST', body, idempotencyKey: command.idempotencyKey, schema: costEvidenceDetailLinkResultSchema })
    },
    listDetailMetadata: (detailId: string): Promise<CostEvidenceMetadata[]> => options.client.request({ url: `${base()}/project-cost-details/${id(detailId)}/evidence`, method: 'GET', schema: z.array(costEvidenceMetadataSchema) }),
    getReadUrl: (evidenceFileId: string, input?: CostEvidenceReadUrlInput): Promise<CostEvidenceReadUrl> => {
      const body = costEvidenceReadUrlInputSchema.parse(input ?? { disposition: 'inline' })
      return options.client.request({
        url: `${base()}/evidence-files/${id(evidenceFileId)}/read-url`,
        method: 'POST',
        body,
        schema: costEvidenceReadUrlSchema,
      })
    },
  }
}
