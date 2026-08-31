import { z } from 'zod'
import {
  criterionEvaluationRevisionInputSchema,
  reactivateStage01InputSchema,
  recordFinalDecisionInputSchema,
  returnForClarificationInputSchema,
  submitRecommendationInputSchema,
} from '../../../shared/schemas/stage01'
import { stage01OperationalDetailSchema } from '../../../shared/schemas/stage01-operational'
import type { Stage01Repository } from '../contracts'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export interface HttpStage01RepositoryOptions {
  companyId: string
  client: AuthenticatedHttpClient
}

export function createHttpStage01Repository(options: HttpStage01RepositoryOptions): Stage01Repository {
  const base = `/api/companies/${encodeURIComponent(options.companyId)}/opportunities`
  const id = (value: string) => encodeURIComponent(value)
  const stage = (opportunityId: string) => `${base}/${id(opportunityId)}/stage-01`
  const postVoid = async (url: string, input: unknown) => {
    await options.client.request({ url, method: 'POST', body: input, schema: z.null() })
  }

  return {
    get: opportunityId => options.client.request({
      url: stage(opportunityId), method: 'GET', schema: stage01OperationalDetailSchema,
    }),
    evaluateCriterion: (opportunityId, criterionKey, input) => postVoid(
      `${stage(opportunityId)}/evaluations/${id(criterionKey)}/revisions`,
      criterionEvaluationRevisionInputSchema.parse(input),
    ),
    submitRecommendation: (opportunityId, input) => postVoid(
      `${stage(opportunityId)}/recommendations`, submitRecommendationInputSchema.parse(input),
    ),
    returnForClarification: (opportunityId, input) => postVoid(
      `${stage(opportunityId)}/clarification-returns`, returnForClarificationInputSchema.parse(input),
    ),
    recordFinalDecision: (opportunityId, input) => postVoid(
      `${stage(opportunityId)}/final-decision`, recordFinalDecisionInputSchema.parse(input),
    ),
    reactivate: (opportunityId, input) => postVoid(
      `${stage(opportunityId)}/reactivate`, reactivateStage01InputSchema.parse(input),
    ),
  }
}
