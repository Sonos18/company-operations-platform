import { z } from 'zod'

const uuid = z.string().uuid()
const meaningfulText = z.string().trim().min(1)

export const assignOpportunityDecisionAuthorityInputSchema = z.object({
  requestId: uuid,
  action: z.literal('assign'),
  authorityUserId: uuid,
  expectedCycleVersion: z.number().int().nonnegative(),
  reason: meaningfulText.nullable(),
}).strict()
export type AssignOpportunityDecisionAuthorityInput = z.infer<typeof assignOpportunityDecisionAuthorityInputSchema>

export const opportunityDecisionAuthorityCandidateSchema = z.object({
  userId: uuid,
  employeeId: uuid,
  displayName: meaningfulText,
  positionTitle: meaningfulText.nullable(),
}).strict()
export type OpportunityDecisionAuthorityCandidate = z.infer<typeof opportunityDecisionAuthorityCandidateSchema>

export const opportunityDecisionAuthorityProjectionSchema = z.object({
  status: z.enum(['unresolved', 'resolved', 'invalid', 'legacy_unknown', 'not_required']),
  userId: uuid.nullable(),
  employeeId: uuid.nullable(),
  displayName: meaningfulText.nullable(),
  positionTitle: meaningfulText.nullable(),
  currentActorIsAuthority: z.boolean(),
  locked: z.boolean(),
  policyBinding: z.object({
    status: z.enum(['bound', 'legacy_unbound', 'not_required']),
    policySnapshotId: uuid.nullable(),
  }).strict().default({ status: 'bound', policySnapshotId: null }),
}).strict()
export type OpportunityDecisionAuthorityProjection = z.infer<typeof opportunityDecisionAuthorityProjectionSchema>
