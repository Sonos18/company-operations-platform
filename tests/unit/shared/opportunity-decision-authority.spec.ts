import { describe, expect, it } from 'vitest'
import {
  assignOpportunityDecisionAuthorityInputSchema,
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
      policyBinding: { status: 'bound', policySnapshotId: null },
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
      policyBinding: { status: 'legacy_unbound', policySnapshotId: null },
    })).toMatchObject({
      policyBinding: { status: 'legacy_unbound', policySnapshotId: null },
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
      policyBinding: { status: 'not_required', policySnapshotId: null },
    })).toMatchObject({
      status: 'not_required',
      policyBinding: { status: 'not_required', policySnapshotId: null },
    })
  })
})
