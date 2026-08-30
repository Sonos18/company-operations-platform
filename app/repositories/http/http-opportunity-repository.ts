import { z } from 'zod'
import {
  addContactMethodInputSchema,
  addOpportunityReferrerInputSchema,
  addOpportunityScopeInputSchema,
  appendIntakeRecordInputSchema,
  contactMethodSchema,
  contactSchema,
  correctIntakeRecordInputSchema,
  createContactInputSchema,
  createOpportunityInputSchema,
  createStage01OpportunityResultSchema,
  duplicateConcernSchema,
  endOpportunityContactInputSchema,
  endOpportunityReferrerInputSchema,
  intakeRecordSchema,
  invalidateOpportunityInputSchema,
  linkOpportunityContactInputSchema,
  opportunityContactSchema,
  opportunityDetailSchema,
  opportunityReferrerSchema,
  opportunityScopeSchema,
  opportunitySummarySchema,
  raiseDuplicateConcernInputSchema,
  resolveDuplicateConcernInputSchema,
  restoreOpportunityInputSchema,
  retireOpportunityScopeInputSchema,
  setPrimaryContactInputSchema,
  setPrimaryReferrerInputSchema,
  updateContactInputSchema,
  updateContactMethodInputSchema,
  updateOpportunityInputSchema,
} from '../../../shared/schemas/opportunities'
import { ClientError } from '../../errors/client-error'
import type { OpportunityRepository } from '../contracts'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export interface HttpOpportunityRepositoryOptions {
  companyId: string
  client: AuthenticatedHttpClient
}

export function createHttpOpportunityRepository(options: HttpOpportunityRepositoryOptions): OpportunityRepository {
  const base = `/api/companies/${encodeURIComponent(options.companyId)}`
  const opportunityBase = `${base}/opportunities`
  const id = (value: string) => encodeURIComponent(value)
  const post = <T>(url: string, input: unknown, schema: z.ZodType<T>) => options.client.request({
    url, method: 'POST', body: input, schema,
  })
  const postVoid = async (url: string, input: unknown) => {
    await post(url, input, z.null())
  }

  return {
    list: () => options.client.request({ url: opportunityBase, method: 'GET', schema: z.array(opportunitySummarySchema) }),
    async getById(opportunityId) {
      try {
        return await options.client.request({ url: `${opportunityBase}/${id(opportunityId)}`, method: 'GET', schema: opportunityDetailSchema })
      } catch (error) {
        if (error instanceof ClientError && error.code === 'OPPORTUNITY_NOT_FOUND') return null
        throw error
      }
    },
    create: input => post(opportunityBase, createOpportunityInputSchema.parse(input), createStage01OpportunityResultSchema),
    update: (opportunityId, input) => options.client.request({
      url: `${opportunityBase}/${id(opportunityId)}`, method: 'PATCH',
      body: updateOpportunityInputSchema.parse(input), schema: opportunityDetailSchema,
    }),
    createContact: input => post(`${base}/contacts`, createContactInputSchema.parse(input), contactSchema),
    updateContact: (contactId, input) => options.client.request({
      url: `${base}/contacts/${id(contactId)}`, method: 'PATCH',
      body: updateContactInputSchema.parse(input), schema: contactSchema,
    }),
    addContactMethod: (contactId, input) => post(`${base}/contacts/${id(contactId)}/methods`,
      addContactMethodInputSchema.parse(input), contactMethodSchema),
    updateContactMethod: (contactId, methodId, input) => options.client.request({
      url: `${base}/contacts/${id(contactId)}/methods/${id(methodId)}`, method: 'PATCH',
      body: updateContactMethodInputSchema.parse(input), schema: contactMethodSchema,
    }),
    linkContact: (opportunityId, input) => post(`${opportunityBase}/${id(opportunityId)}/contacts`,
      linkOpportunityContactInputSchema.parse(input), opportunityContactSchema),
    setPrimaryContact: (opportunityId, input) => post(`${opportunityBase}/${id(opportunityId)}/primary-contact`,
      setPrimaryContactInputSchema.parse(input), opportunityContactSchema),
    endContactRelationship: (opportunityId, relationshipId, input) => postVoid(
      `${opportunityBase}/${id(opportunityId)}/contacts/${id(relationshipId)}/end`,
      endOpportunityContactInputSchema.parse(input),
    ),
    addScope: (opportunityId, input) => post(`${opportunityBase}/${id(opportunityId)}/scopes`,
      addOpportunityScopeInputSchema.parse(input), opportunityScopeSchema),
    retireScope: (opportunityId, scopeId, input) => postVoid(
      `${opportunityBase}/${id(opportunityId)}/scopes/${id(scopeId)}/retire`,
      retireOpportunityScopeInputSchema.parse(input),
    ),
    addReferrer: (opportunityId, input) => post(`${opportunityBase}/${id(opportunityId)}/referrers`,
      addOpportunityReferrerInputSchema.parse(input), opportunityReferrerSchema),
    setPrimaryReferrer: (opportunityId, input) => post(`${opportunityBase}/${id(opportunityId)}/primary-referrer`,
      setPrimaryReferrerInputSchema.parse(input), opportunityReferrerSchema),
    endReferrer: (opportunityId, referrerId, input) => postVoid(
      `${opportunityBase}/${id(opportunityId)}/referrers/${id(referrerId)}/end`,
      endOpportunityReferrerInputSchema.parse(input),
    ),
    addIntakeRecord: (opportunityId, input) => post(`${opportunityBase}/${id(opportunityId)}/intake-records`,
      appendIntakeRecordInputSchema.parse(input), intakeRecordSchema),
    correctIntakeRecord: (opportunityId, recordId, input) => post(
      `${opportunityBase}/${id(opportunityId)}/intake-records/${id(recordId)}/corrections`,
      correctIntakeRecordInputSchema.parse(input), intakeRecordSchema,
    ),
    raiseDuplicateConcern: (opportunityId, input) => post(`${opportunityBase}/${id(opportunityId)}/duplicate-concerns`,
      raiseDuplicateConcernInputSchema.parse(input), duplicateConcernSchema),
    resolveDuplicateConcern: (opportunityId, concernId, input) => postVoid(
      `${opportunityBase}/${id(opportunityId)}/duplicate-concerns/${id(concernId)}/resolve`,
      resolveDuplicateConcernInputSchema.parse(input),
    ),
    invalidate: (opportunityId, input) => postVoid(`${opportunityBase}/${id(opportunityId)}/invalidate`,
      invalidateOpportunityInputSchema.parse(input)),
    restore: (opportunityId, input) => postVoid(`${opportunityBase}/${id(opportunityId)}/restore`,
      restoreOpportunityInputSchema.parse(input)),
  }
}
