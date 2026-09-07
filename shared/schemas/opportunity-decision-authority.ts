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

export const transitionOpportunityDecisionPolicyInputSchema = z.object({
  requestId: uuid,
  expectedCycleVersion: z.number().int().nonnegative(),
  transitionCode: z.literal('b4_acceptance_policy_transition'),
  reason: meaningfulText,
}).strict()
export type TransitionOpportunityDecisionPolicyInput = z.infer<typeof transitionOpportunityDecisionPolicyInputSchema>

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
    transitionEligible: z.boolean(),
  }).strict().default({ status: 'bound', policySnapshotId: null, transitionEligible: false }),
}).strict()
export type OpportunityDecisionAuthorityProjection = z.infer<typeof opportunityDecisionAuthorityProjectionSchema>
