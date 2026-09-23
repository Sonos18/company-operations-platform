import { z } from 'zod'
import {
  costEvidenceCreateIntentInputSchema,
  costEvidenceFinalizeInputSchema,
  costEvidenceFinalizedSchema,
  costEvidenceLinkInputSchema,
  costEvidenceLinkResultSchema,
  costEvidenceMetadataSchema,
  costEvidenceReadUrlInputSchema,
  costEvidenceReadUrlSchema,
  costEvidenceUploadIntentSchema,
  type CostEvidenceCreateIntentInput,
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
  createIdempotencyKey?: () => string
}): CostEvidenceRepository {
  const company = () => encodeURIComponent(typeof options.companyId === 'function' ? options.companyId() : options.companyId)
  const id = (value: string) => encodeURIComponent(value)
  const base = () => `/api/companies/${company()}`
  const nextIdempotencyKey = () => (options.createIdempotencyKey ?? (() => globalThis.crypto.randomUUID()))()

  return {
    createUploadIntent: (projectId: string, input: CostEvidenceCreateIntentInput): Promise<CostEvidenceUploadIntent> => {
      const body = costEvidenceCreateIntentInputSchema.parse(input)
      return options.client.request({
        url: `${base()}/projects/${id(projectId)}/evidence/upload-intents`,
        method: 'POST',
        body,
        idempotencyKey: nextIdempotencyKey(),
        schema: costEvidenceUploadIntentSchema,
      })
    },
    finalize: (evidenceFileId: string, input: CostEvidenceFinalizeInput): Promise<CostEvidenceFinalized> => {
      const body = costEvidenceFinalizeInputSchema.parse(input)
      return options.client.request({
        url: `${base()}/evidence-files/${id(evidenceFileId)}/finalize`,
        method: 'POST',
        body,
        idempotencyKey: nextIdempotencyKey(),
        schema: costEvidenceFinalizedSchema,
      })
    },
    link: (projectCostItemId: string, input: CostEvidenceLinkInput): Promise<CostEvidenceLinkResult> => {
      const body = costEvidenceLinkInputSchema.parse(input)
      return options.client.request({
        url: `${base()}/project-costs/${id(projectCostItemId)}/evidence`,
        method: 'POST',
        body,
        idempotencyKey: nextIdempotencyKey(),
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
