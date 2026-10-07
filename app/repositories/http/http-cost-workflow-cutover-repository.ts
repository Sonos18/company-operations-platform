import { workflowUuidSchema } from '../../../shared/schemas/costs/cost-workflow'
import { workflowCompanyConfigurationSchema, workflowCrewClassificationSchema, workflowCompanyActivationSchema, workflowCompanyCommandResultSchema, workflowClassificationResultSchema, workflowCutoverSnapshotSchema, workflowCutoverCrewsSchema, type WorkflowCompanyConfiguration, type WorkflowCrewClassification, type WorkflowCompanyActivation } from '../../../shared/schemas/costs/cost-workflow-cutover'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export function createHttpCostWorkflowCutoverRepository(companyId: string, client: AuthenticatedHttpClient) {
  const base = '/api/companies/' + encodeURIComponent(workflowUuidSchema.parse(companyId)) + '/cost-workflow'
  const key = (value: string) => workflowUuidSchema.parse(value)
  return {
    snapshot: () => client.request({url: base + '/snapshot', schema: workflowCutoverSnapshotSchema}),
    crews: () => client.request({url: base + '/crews', schema: workflowCutoverCrewsSchema}),
    configure: (input: WorkflowCompanyConfiguration, idempotencyKey: string) => client.request({url: base + '/configuration', method: 'PUT', body: workflowCompanyConfigurationSchema.parse(input), idempotencyKey: key(idempotencyKey), schema: workflowCompanyCommandResultSchema}),
    classify: (partyId: string, input: WorkflowCrewClassification, idempotencyKey: string) => client.request({url: base + '/crews/' + encodeURIComponent(workflowUuidSchema.parse(partyId)) + '/classification', method: 'POST', body: workflowCrewClassificationSchema.parse(input), idempotencyKey: key(idempotencyKey), schema: workflowClassificationResultSchema}),
    activate: (input: WorkflowCompanyActivation, idempotencyKey: string) => client.request({url: base + '/activation', method: 'POST', body: workflowCompanyActivationSchema.parse(input), idempotencyKey: key(idempotencyKey), schema: workflowCompanyCommandResultSchema}),
  }
}
