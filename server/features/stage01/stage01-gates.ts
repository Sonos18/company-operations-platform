import type { GateReport } from '../../../shared/schemas/workflow'
import { gateCheck, gateReport } from '../workflow/workflow-gates'

type ReliabilityState = 'unverified' | 'confirmed' | 'disputed'
type LocationStatus = 'unknown' | 'area_known' | 'relative' | 'exact'
type CriterionCriticality = 'required' | 'optional' | 'conditional'
type CriterionApplicability = 'applicable' | 'not_applicable'
type CriterionResult = 'fit' | 'concern' | 'not_fit' | 'insufficient_information'
type FinalOutcome = 'proceed' | 'not_proceeding'

export interface Stage01IntakeGateInput {
  validityState: 'valid' | 'invalid'
  hasIntakeOwner: boolean
  primaryCustomerName: string | null
  customerTypeCode: string | null
  hasActivePrimaryContact: boolean
  primaryContactRelationshipCode: string | null
  usableContactMethodCount: number
  activeScopeCount: number
  needDescription: string | null
  locationStatus: LocationStatus | null
  primaryLeadSourceCode: string | null
  leadSourceRequiresReferrer: boolean
  activePrimaryReferrerCount: number
  engagementStatusCode: string | null
  intakeRecordCount: number
  openBlockingBlockerCount: number
  unresolvedDuplicateConcernCount: number
  budgetStatusCode?: string | null
  timelineStatusCode?: string | null
  fileCount?: number
  projectManagerUserId?: string | null
  reliabilityStates?: ReliabilityState[]
}

export interface Stage01EvaluationCriterionDefinition {
  key: string
  criticality: CriterionCriticality
  allowsNotApplicable: boolean
}

export interface Stage01EvaluationFact {
  criterionKey: string
  revision: number
  applicability: CriterionApplicability
  result: CriterionResult | null
  evaluatedAt: string
}

export interface Stage01RecommendationFact {
  version: number
  submittedAt: string
}

export interface Stage01ClarificationFact {
  returnedAt: string
}

export interface Stage01EvaluationGateInput {
  criterionDefinitions: Stage01EvaluationCriterionDefinition[]
  evaluations: Stage01EvaluationFact[]
  recommendations: Stage01RecommendationFact[]
  clarificationReturns: Stage01ClarificationFact[]
  intakeDependencyCurrentlyValid: boolean
  hasOpenBlockingBlocker: boolean
  needsRevalidation: boolean
  finalOutcome: FinalOutcome | null
}

function hasMeaningfulText(value: string | null): boolean {
  return value !== null && value.trim().length > 0
}

export function evaluateStage01IntakeGates(input: Stage01IntakeGateInput): GateReport {
  const checks: GateReport['checks'] = [
    gateCheck({
      code: 'OPPORTUNITY_VALID',
      satisfied: input.validityState === 'valid',
      satisfiedMessage: 'Opportunity is valid.',
      unsatisfiedMessage: 'Opportunity is invalid.',
      unsatisfiedStatus: 'blocked',
    }),
    gateCheck({
      code: 'INTAKE_OWNER_ASSIGNED',
      satisfied: input.hasIntakeOwner,
      satisfiedMessage: 'An active Intake Owner is assigned.',
      unsatisfiedMessage: 'An active Intake Owner is required.',
    }),
    gateCheck({
      code: 'PRIMARY_CUSTOMER_PRESENT',
      satisfied: hasMeaningfulText(input.primaryCustomerName),
      satisfiedMessage: 'Primary Customer context is present.',
      unsatisfiedMessage: 'Primary Customer context is required.',
    }),
    gateCheck({
      code: 'CUSTOMER_TYPE_PRESENT',
      satisfied: hasMeaningfulText(input.customerTypeCode),
      satisfiedMessage: 'Customer Type is present.',
      unsatisfiedMessage: 'Customer Type is required.',
    }),
    gateCheck({
      code: 'PRIMARY_CONTACT_PRESENT',
      satisfied: input.hasActivePrimaryContact,
      satisfiedMessage: 'An active Primary Contact is present.',
      unsatisfiedMessage: 'An active Primary Contact is required.',
    }),
    gateCheck({
      code: 'CONTACT_METHOD_USABLE',
      satisfied: input.usableContactMethodCount > 0,
      satisfiedMessage: 'The Primary Contact has a usable Contact Method.',
      unsatisfiedMessage: 'At least one usable Contact Method is required.',
    }),
    gateCheck({
      code: 'CONTACT_RELATIONSHIP_PRESENT',
      satisfied: hasMeaningfulText(input.primaryContactRelationshipCode),
      satisfiedMessage: 'Primary Contact relationship is present.',
      unsatisfiedMessage: 'Primary Contact relationship is required.',
    }),
    gateCheck({
      code: 'SCOPE_PRESENT',
      satisfied: input.activeScopeCount > 0,
      satisfiedMessage: 'At least one active Scope is present.',
      unsatisfiedMessage: 'At least one active Scope is required.',
    }),
    gateCheck({
      code: 'NEED_DESCRIPTION_PRESENT',
      satisfied: hasMeaningfulText(input.needDescription),
      satisfiedMessage: 'Need description is present.',
      unsatisfiedMessage: 'A meaningful need description is required.',
    }),
    gateCheck({
      code: 'LOCATION_STATUS_PRESENT',
      satisfied: input.locationStatus !== null,
      satisfiedMessage: 'Location status is present.',
      unsatisfiedMessage: 'Location status is required.',
    }),
    gateCheck({
      code: 'LEAD_SOURCE_PRESENT',
      satisfied: hasMeaningfulText(input.primaryLeadSourceCode),
      satisfiedMessage: 'Primary Lead Source is present.',
      unsatisfiedMessage: 'Primary Lead Source is required.',
    }),
    gateCheck({
      code: 'REFERRER_PRESENT_IF_REQUIRED',
      satisfied: !input.leadSourceRequiresReferrer || input.activePrimaryReferrerCount === 1,
      satisfiedMessage: 'Referrer requirement is satisfied.',
      unsatisfiedMessage: 'Exactly one active Primary Referrer is required for this Lead Source.',
    }),
    gateCheck({
      code: 'ENGAGEMENT_STATUS_PRESENT',
      satisfied: hasMeaningfulText(input.engagementStatusCode),
      satisfiedMessage: 'Engagement status is present.',
      unsatisfiedMessage: 'Engagement status is required.',
    }),
    gateCheck({
      code: 'INTAKE_RECORD_PRESENT',
      satisfied: input.intakeRecordCount > 0,
      satisfiedMessage: 'At least one Intake Record is present.',
      unsatisfiedMessage: 'At least one Intake Record is required.',
    }),
    gateCheck({
      code: 'NO_OPEN_BLOCKING_BLOCKER',
      satisfied: input.openBlockingBlockerCount === 0,
      satisfiedMessage: 'There is no open blocking Blocker.',
      unsatisfiedMessage: 'An open blocking Blocker must be resolved.',
      unsatisfiedStatus: 'blocked',
    }),
    gateCheck({
      code: 'NO_UNRESOLVED_DUPLICATE',
      satisfied: input.unresolvedDuplicateConcernCount === 0,
      satisfiedMessage: 'There is no unresolved duplicate concern.',
      unsatisfiedMessage: 'An unresolved duplicate concern must be resolved.',
      unsatisfiedStatus: 'blocked',
    }),
  ]

  return gateReport(checks)
}

function currentEvaluationByCriterion(evaluations: Stage01EvaluationFact[]) {
  const current = new Map<string, Stage01EvaluationFact>()
  for (const evaluation of evaluations) {
    const existing = current.get(evaluation.criterionKey)
    if (existing === undefined || evaluation.revision > existing.revision) {
      current.set(evaluation.criterionKey, evaluation)
    }
  }
  return current
}

function criterionIsGateSatisfied(
  definition: Stage01EvaluationCriterionDefinition,
  evaluation: Stage01EvaluationFact | undefined,
): boolean {
  if (definition.criticality === 'optional') return true
  if (evaluation === undefined) return false
  if (evaluation.applicability === 'not_applicable') {
    return definition.allowsNotApplicable && evaluation.result === null
  }
  return evaluation.result === 'fit'
    || evaluation.result === 'concern'
    || evaluation.result === 'not_fit'
}

function latestTimestamp(values: string[]): number | null {
  if (values.length === 0) return null
  return Math.max(...values.map(value => Date.parse(value)))
}

export function evaluateStage01EvaluationGates(input: Stage01EvaluationGateInput): GateReport {
  const currentEvaluations = currentEvaluationByCriterion(input.evaluations)
  const criteriaSatisfied = input.criterionDefinitions.every(definition => criterionIsGateSatisfied(
    definition,
    currentEvaluations.get(definition.key),
  ))
  const latestRecommendation = input.recommendations.reduce<Stage01RecommendationFact | null>(
    (latest, recommendation) => latest === null || recommendation.version > latest.version
      ? recommendation
      : latest,
    null,
  )
  const latestEvaluationAt = latestTimestamp(input.evaluations.map(evaluation => evaluation.evaluatedAt))
  const latestClarificationAt = latestTimestamp(
    input.clarificationReturns.map(clarification => clarification.returnedAt),
  )
  const recommendationAt = latestRecommendation === null
    ? null
    : Date.parse(latestRecommendation.submittedAt)
  const recommendationCurrent = recommendationAt !== null
    && (latestEvaluationAt === null || recommendationAt >= latestEvaluationAt)
    && (latestClarificationAt === null || recommendationAt > latestClarificationAt)

  return gateReport([
    gateCheck({
      code: 'INTAKE_DEPENDENCY_VALID',
      satisfied: input.intakeDependencyCurrentlyValid,
      satisfiedMessage: 'The current Intake completion dependency is valid.',
      unsatisfiedMessage: 'The current Intake completion dependency requires revalidation.',
      unsatisfiedStatus: 'needs_revalidation',
    }),
    gateCheck({
      code: 'REQUIRED_CRITERIA_EVALUATED',
      satisfied: criteriaSatisfied,
      satisfiedMessage: 'All required applicable criteria are gate-satisfied.',
      unsatisfiedMessage: 'One or more required criteria are incomplete.',
    }),
    gateCheck({
      code: 'RECOMMENDATION_CURRENT',
      satisfied: recommendationCurrent,
      satisfiedMessage: 'A current Recommendation is present.',
      unsatisfiedMessage: 'A current Recommendation is required.',
    }),
    gateCheck({
      code: 'FINAL_DECISION_RECORDED',
      satisfied: input.finalOutcome !== null,
      satisfiedMessage: 'Final Decision is recorded.',
      unsatisfiedMessage: 'Final Decision is required.',
    }),
    gateCheck({
      code: 'NO_OPEN_BLOCKING_BLOCKER',
      satisfied: !input.hasOpenBlockingBlocker,
      satisfiedMessage: 'There is no open blocking Blocker.',
      unsatisfiedMessage: 'An open blocking Blocker must be resolved.',
      unsatisfiedStatus: 'blocked',
    }),
    gateCheck({
      code: 'NO_REVALIDATION_REQUIRED',
      satisfied: !input.needsRevalidation,
      satisfiedMessage: 'The Evaluation execution does not require revalidation.',
      unsatisfiedMessage: 'The Evaluation execution requires revalidation.',
      unsatisfiedStatus: 'needs_revalidation',
    }),
  ])
}
