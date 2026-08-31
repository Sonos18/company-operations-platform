import { z } from 'zod'
import {
  createStage01ConfigDraftInputSchema,
  discardStage01ConfigDraftInputSchema,
  publishStage01ConfigDraftInputSchema,
  publishStage01ConfigResultSchema,
  stage01BusinessConfigViewSchema,
  stage01ConfigDraftSchema,
  updateStage01ConfigDraftInputSchema,
} from '../../../shared/schemas/stage01-config'
import type { Stage01ConfigRepository } from '../contracts'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export interface HttpStage01ConfigRepositoryOptions {
  companyId: string
  client: AuthenticatedHttpClient
}

export function createHttpStage01ConfigRepository(options: HttpStage01ConfigRepositoryOptions): Stage01ConfigRepository {
  const base = `/api/companies/${encodeURIComponent(options.companyId)}/stage-01/config`
  const request = <T>(url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', schema: z.ZodType<T>, body?: unknown) => (
    options.client.request({ url, method, schema, ...(body === undefined ? {} : { body }) })
  )

  return {
    get: () => request(base, 'GET', stage01BusinessConfigViewSchema),
    createDraft: input => request(
      `${base}/draft`, 'POST', stage01ConfigDraftSchema, createStage01ConfigDraftInputSchema.parse(input),
    ),
    updateDraft: input => request(
      `${base}/draft`, 'PUT', stage01ConfigDraftSchema, updateStage01ConfigDraftInputSchema.parse(input),
    ),
    async discardDraft(input) {
      await request(`${base}/draft`, 'DELETE', z.null(), discardStage01ConfigDraftInputSchema.parse(input))
    },
    publishDraft: input => request(
      `${base}/draft/publish`, 'POST', publishStage01ConfigResultSchema,
      publishStage01ConfigDraftInputSchema.parse(input),
    ),
  }
}
