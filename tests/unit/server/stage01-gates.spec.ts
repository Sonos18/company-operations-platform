import { describe, expect, it } from 'vitest'
import {
  evaluateStage01EvaluationGates,
  evaluateStage01IntakeGates,
} from '../../../server/features/stage01/stage01-gates'

function statusFor(
  report: ReturnType<typeof evaluateStage01IntakeGates> | ReturnType<typeof evaluateStage01EvaluationGates>,
  code: string,
) {
  return report.checks.find(check => check.code === code)?.status
}

const completeIntakeInput = {
  validityState: 'valid' as const,
  hasIntakeOwner: true,
  primaryCustomerName: 'Customer A',
  customerTypeCode: 'business',
  hasActivePrimaryContact: true,
  primaryContactRelationshipCode: 'decision_maker',
  usableContactMethodCount: 1,
  activeScopeCount: 1,
  needDescription: 'Design and build a complete workspace',
  locationStatus: 'unknown' as const,
  primaryLeadSourceCode: 'direct',
  leadSourceRequiresReferrer: false,
  activePrimaryReferrerCount: 0,
  engagementStatusCode: 'qualified',
  intakeRecordCount: 1,
  openBlockingBlockerCount: 0,
  unresolvedDuplicateConcernCount: 0,
  budgetStatusCode: null,
  timelineStatusCode: null,
  fileCount: 0,
  projectManagerUserId: null,
  reliabilityStates: ['disputed' as const],
}

describe('evaluateStage01IntakeGates', () => {
  it('returns every approved 01.1 gate code in stable order', () => {
    const report = evaluateStage01IntakeGates(completeIntakeInput)

    expect(report.satisfied).toBe(true)
    expect(report.checks.map(check => check.code)).toEqual([
      'OPPORTUNITY_VALID',
      'INTAKE_OWNER_ASSIGNED',
      'PRIMARY_CUSTOMER_PRESENT',
      'CUSTOMER_TYPE_PRESENT',
      'PRIMARY_CONTACT_PRESENT',
      'CONTACT_METHOD_USABLE',
      'CONTACT_RELATIONSHIP_PRESENT',
      'SCOPE_PRESENT',
      'NEED_DESCRIPTION_PRESENT',
      'LOCATION_STATUS_PRESENT',
      'LEAD_SOURCE_PRESENT',
      'REFERRER_PRESENT_IF_REQUIRED',
      'ENGAGEMENT_STATUS_PRESENT',
      'INTAKE_RECORD_PRESENT',
      'NO_OPEN_BLOCKING_BLOCKER',
      'NO_UNRESOLVED_DUPLICATE',
    ])
    expect(report.checks.every(check => check.status === 'satisfied')).toBe(true)
  })

  it('does not make budget, timeline, files, Project Manager, or reliability metadata into gates', () => {
    expect(evaluateStage01IntakeGates({
      ...completeIntakeInput,
      budgetStatusCode: null,
      timelineStatusCode: null,
      fileCount: 0,
      projectManagerUserId: null,
      reliabilityStates: ['disputed'],
    }).satisfied).toBe(true)
  })

  it('requires at least one usable Contact Method', () => {
    const report = evaluateStage01IntakeGates({
      ...completeIntakeInput,
      usableContactMethodCount: 0,
    })

    expect(report.satisfied).toBe(false)
    expect(statusFor(report, 'CONTACT_METHOD_USABLE')).toBe('missing')
  })

  it('requires exactly one active Primary Referrer only when Lead Source behavior requires it', () => {
    const missing = evaluateStage01IntakeGates({
      ...completeIntakeInput,
      leadSourceRequiresReferrer: true,
      activePrimaryReferrerCount: 0,
    })
    const present = evaluateStage01IntakeGates({
      ...completeIntakeInput,
      leadSourceRequiresReferrer: true,
      activePrimaryReferrerCount: 1,
    })

    expect(statusFor(missing, 'REFERRER_PRESENT_IF_REQUIRED')).toBe('missing')
    expect(statusFor(present, 'REFERRER_PRESENT_IF_REQUIRED')).toBe('satisfied')
  })

  it('distinguishes missing facts from blockers and duplicate concerns', () => {
    const report = evaluateStage01IntakeGates({
      ...completeIntakeInput,
      primaryCustomerName: ' ',
      openBlockingBlockerCount: 1,
      unresolvedDuplicateConcernCount: 1,
    })

    expect(statusFor(report, 'PRIMARY_CUSTOMER_PRESENT')).toBe('missing')
    expect(statusFor(report, 'NO_OPEN_BLOCKING_BLOCKER')).toBe('blocked')
    expect(statusFor(report, 'NO_UNRESOLVED_DUPLICATE')).toBe('blocked')
  })
})

const criterionDefinitions = [
  { key: 'customer-need', criticality: 'required' as const, allowsNotApplicable: false },
  { key: 'scope-capability', criticality: 'required' as const, allowsNotApplicable: false },
]

const currentEvaluations = [
  {
    criterionKey: 'customer-need', revision: 1,
    applicability: 'applicable' as const, result: 'fit' as const,
    evaluatedAt: '2026-08-29T10:00:00.000Z',
  },
  {
    criterionKey: 'scope-capability', revision: 1,
    applicability: 'applicable' as const, result: 'concern' as const,
    evaluatedAt: '2026-08-29T10:05:00.000Z',
  },
]

const completeEvaluationInput = {
  criterionDefinitions,
  evaluations: currentEvaluations,
  recommendations: [{ version: 1, submittedAt: '2026-08-29T10:10:00.000Z' }],
  clarificationReturns: [] as Array<{ returnedAt: string }>,
  intakeDependencyCurrentlyValid: true,
  hasOpenBlockingBlocker: false,
  needsRevalidation: false,
  finalOutcome: 'proceed' as const,
}

describe('evaluateStage01EvaluationGates', () => {
  it('uses only the highest criterion revision and rejects insufficient information for a required criterion', () => {
    const report = evaluateStage01EvaluationGates({
      ...completeEvaluationInput,
      evaluations: [
        ...currentEvaluations,
        {
          criterionKey: 'customer-need', revision: 2,
          applicability: 'applicable', result: 'insufficient_information',
          evaluatedAt: '2026-08-29T10:20:00.000Z',
        } as const,
      ],
    })

    expect(statusFor(report, 'REQUIRED_CRITERIA_EVALUATED')).toBe('missing')
  })

  it.each(['concern', 'not_fit'] as const)(
    'treats %s as evaluated without inferring a business outcome',
    (result) => {
      const report = evaluateStage01EvaluationGates({
        ...completeEvaluationInput,
        evaluations: currentEvaluations.map(evaluation => ({
          ...evaluation,
          result: evaluation.criterionKey === 'customer-need' ? result : evaluation.result,
        })),
        finalOutcome: null,
      })

      expect(statusFor(report, 'REQUIRED_CRITERIA_EVALUATED')).toBe('satisfied')
      expect(statusFor(report, 'FINAL_DECISION_RECORDED')).toBe('missing')
    },
  )

  it('invalidates an earlier Recommendation when a later criterion revision exists', () => {
    const report = evaluateStage01EvaluationGates({
      ...completeEvaluationInput,
      evaluations: [
        ...currentEvaluations,
        {
          criterionKey: 'customer-need', revision: 2,
          applicability: 'applicable', result: 'fit',
          evaluatedAt: '2026-08-29T10:20:00.000Z',
        } as const,
      ],
    })

    expect(statusFor(report, 'RECOMMENDATION_CURRENT')).toBe('missing')
  })

  it('requires a Recommendation newer than the latest Clarification Return', () => {
    const stale = evaluateStage01EvaluationGates({
      ...completeEvaluationInput,
      clarificationReturns: [{ returnedAt: '2026-08-29T10:20:00.000Z' }],
    })
    const refreshed = evaluateStage01EvaluationGates({
      ...completeEvaluationInput,
      recommendations: [
        ...completeEvaluationInput.recommendations,
        { version: 2, submittedAt: '2026-08-29T10:30:00.000Z' },
      ],
      clarificationReturns: [{ returnedAt: '2026-08-29T10:20:00.000Z' }],
    })

    expect(statusFor(stale, 'RECOMMENDATION_CURRENT')).toBe('missing')
    expect(statusFor(refreshed, 'RECOMMENDATION_CURRENT')).toBe('satisfied')
  })

  it('accepts an allowed not-applicable revision and fails closed when N/A is not allowed', () => {
    const evaluation = {
      criterionKey: 'customer-need', revision: 1,
      applicability: 'not_applicable' as const, result: null,
      evaluatedAt: '2026-08-29T10:00:00.000Z',
    }
    const allowed = evaluateStage01EvaluationGates({
      ...completeEvaluationInput,
      criterionDefinitions: [
        { key: 'customer-need', criticality: 'required', allowsNotApplicable: true },
      ],
      evaluations: [evaluation],
    })
    const denied = evaluateStage01EvaluationGates({
      ...completeEvaluationInput,
      criterionDefinitions: [
        { key: 'customer-need', criticality: 'required', allowsNotApplicable: false },
      ],
      evaluations: [evaluation],
    })

    expect(statusFor(allowed, 'REQUIRED_CRITERIA_EVALUATED')).toBe('satisfied')
    expect(statusFor(denied, 'REQUIRED_CRITERIA_EVALUATED')).toBe('missing')
  })
})
