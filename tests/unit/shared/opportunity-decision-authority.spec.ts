import { describe, expect, it } from 'vitest'
import {
  assignOpportunityDecisionAuthorityInputSchema,
  transitionOpportunityDecisionPolicyInputSchema,
  opportunityDecisionAuthorityProjectionSchema,
} from '../../../shared/schemas/opportunity-decision-authority'

const id = (suffix: string) => `92000000-0000-4000-8000-${suffix}`

describe('Opportunity Decision Authority schemas', () => {
  it('accepts an initial assignment with an optional reason', () => {
    expect(assignOpportunityDecisionAuthorityInputSchema.parse({
      requestId: id('000000000001'),
      action: 'assign',
      authorityUserId: id('000000000002'),
      expectedCycleVersion: 7,
      reason: null,
    })).toEqual({
      requestId: id('000000000001'),
      action: 'assign',
      authorityUserId: id('000000000002'),
      expectedCycleVersion: 7,
      reason: null,
    })
  })

  it('projects unresolved authority without exposing client-derived eligibility', () => {
    expect(opportunityDecisionAuthorityProjectionSchema.parse({
      status: 'unresolved',
      userId: null,
      employeeId: null,
      displayName: null,
      positionTitle: null,
      currentActorIsAuthority: false,
      locked: false,
    })).toEqual({
      status: 'unresolved',
      userId: null,
      employeeId: null,
      displayName: null,
      positionTitle: null,
      currentActorIsAuthority: false,
      locked: false,
      policyBinding: { status: 'bound', policySnapshotId: null, transitionEligible: false },
    })
  })

  it('projects a legacy-unbound policy state without choosing a latest policy on read', () => {
    expect(opportunityDecisionAuthorityProjectionSchema.parse({
      status: 'legacy_unknown',
      userId: null,
      employeeId: null,
      displayName: null,
      positionTitle: null,
      currentActorIsAuthority: false,
      locked: false,
      policyBinding: { status: 'legacy_unbound', policySnapshotId: null, transitionEligible: true },
    })).toMatchObject({
      policyBinding: { status: 'legacy_unbound', policySnapshotId: null, transitionEligible: true },
    })
  })

  it('projects a company where Decision Authority is not required', () => {
    expect(opportunityDecisionAuthorityProjectionSchema.parse({
      status: 'not_required',
      userId: null,
      employeeId: null,
      displayName: null,
      positionTitle: null,
      currentActorIsAuthority: false,
      locked: false,
      policyBinding: { status: 'not_required', policySnapshotId: null, transitionEligible: false },
    })).toMatchObject({
      status: 'not_required',
      policyBinding: { status: 'not_required', policySnapshotId: null, transitionEligible: false },
    })
  })

  it('accepts an explicit versioned B4 decision-policy transition command', () => {
    expect(transitionOpportunityDecisionPolicyInputSchema.parse({
      requestId: id('000000000003'),
      expectedCycleVersion: 7,
      transitionCode: 'b4_acceptance_policy_transition',
      reason: 'Bind VQH Decision Policy v1 for this unresolved acceptance cycle.',
    })).toEqual({
      requestId: id('000000000003'),
      expectedCycleVersion: 7,
      transitionCode: 'b4_acceptance_policy_transition',
      reason: 'Bind VQH Decision Policy v1 for this unresolved acceptance cycle.',
    })
  })
})
