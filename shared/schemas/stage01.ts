import { z } from 'zod'
import { opportunityDetailSchema } from './opportunities'
import { gateReportSchema, workflowNodeRuntimeSchema } from './workflow'

const uuidSchema = z.string().uuid()
const versionSchema = z.number().int().nonnegative()
const meaningfulTextSchema = z.string().trim().min(1)
const timestampSchema = z.string().datetime({ offset: true })

export const stage01DimensionSchema = z.enum([
  'customer_need',
  'scope_capability',
  'resources_schedule',
  'commercial_viability',
  'risk_special_conditions',
])
export const stage01CriterionCriticalitySchema = z.enum(['required', 'optional', 'conditional'])
export const stage01ApplicabilityModeSchema = z.enum(['always', 'manual'])
export const stage01CriterionApplicabilitySchema = z.enum(['applicable', 'not_applicable'])
export const stage01CriterionResultSchema = z.enum([
  'fit',
  'concern',
  'not_fit',
  'insufficient_information',
])
export const stage01RecommendationValueSchema = z.enum([
  'recommend_proceed',
  'recommend_not_proceeding',
])
export const stage01FinalOutcomeSchema = z.enum(['proceed', 'not_proceeding'])

export const stage01CriterionDefinitionSchema = z.object({
  key: meaningfulTextSchema,
  dimensionKey: stage01DimensionSchema,
  label: meaningfulTextSchema,
  description: meaningfulTextSchema,
  criticality: stage01CriterionCriticalitySchema,
  applicabilityMode: stage01ApplicabilityModeSchema,
  allowsNotApplicable: z.boolean(),
  displayOrder: z.number().int().nonnegative(),
}).strict()
export type Stage01CriterionDefinition = z.infer<typeof stage01CriterionDefinitionSchema>

export const stage01CriterionEvaluationSchema = z.object({
  id: uuidSchema,
  decisionCycleId: uuidSchema,
  criterionKey: meaningfulTextSchema,
  revision: z.number().int().positive(),
  applicability: stage01CriterionApplicabilitySchema,
  result: stage01CriterionResultSchema.nullable(),
  rationale: meaningfulTextSchema.nullable(),
  evidence: z.array(z.unknown()),
  evaluatedBy: uuidSchema,
  evaluatedAt: timestampSchema,
}).strict()
export type Stage01CriterionEvaluation = z.infer<typeof stage01CriterionEvaluationSchema>

export const stage01RecommendationSchema = z.object({
  id: uuidSchema,
  decisionCycleId: uuidSchema,
  version: z.number().int().positive(),
  recommendation: stage01RecommendationValueSchema,
  rationale: meaningfulTextSchema,
  evidence: z.array(z.unknown()),
  submittedBy: uuidSchema,
  submittedAt: timestampSchema,
}).strict()
export type Stage01Recommendation = z.infer<typeof stage01RecommendationSchema>

export const stage01ClarificationReturnSchema = z.object({
  id: uuidSchema,
  decisionCycleId: uuidSchema,
  recommendationId: uuidSchema,
  reason: meaningfulTextSchema,
  returnedBy: uuidSchema,
  returnedAt: timestampSchema,
}).strict()
export type Stage01ClarificationReturn = z.infer<typeof stage01ClarificationReturnSchema>

export const stage01DecisionCycleSchema = z.object({
  id: uuidSchema,
  opportunityId: uuidSchema,
  nodeExecutionId: uuidSchema,
  cycleNo: z.number().int().positive(),
  decisionAuthorityUserId: uuidSchema.nullable(),
  authorityResolutionReference: meaningfulTextSchema.nullable(),
  reactivationReason: meaningfulTextSchema.nullable(),
  finalOutcome: stage01FinalOutcomeSchema.nullable(),
  finalDecisionBy: uuidSchema.nullable(),
  finalDecisionAt: timestampSchema.nullable(),
  finalRationale: meaningfulTextSchema.nullable(),
  finalRecommendationId: uuidSchema.nullable(),
  overrideRationale: meaningfulTextSchema.nullable(),
  version: versionSchema,
  evaluations: z.array(stage01CriterionEvaluationSchema),
  recommendations: z.array(stage01RecommendationSchema),
  clarificationReturns: z.array(stage01ClarificationReturnSchema),
  createdAt: timestampSchema,
}).strict()
export type Stage01DecisionCycle = z.infer<typeof stage01DecisionCycleSchema>

export const stage01DetailSchema = z.object({
  opportunity: opportunityDetailSchema,
  intake: z.object({
    runtime: workflowNodeRuntimeSchema,
    gates: gateReportSchema,
  }).strict(),
  evaluation: z.object({
    runtime: workflowNodeRuntimeSchema,
    gates: gateReportSchema,
  }).strict(),
  currentDecisionCycle: stage01DecisionCycleSchema,
  actorCapabilities: z.array(meaningfulTextSchema),
}).strict()
export type Stage01Detail = z.infer<typeof stage01DetailSchema>

export const criterionEvaluationRevisionInputSchema = z.object({
  expectedCycleVersion: versionSchema,
  applicability: stage01CriterionApplicabilitySchema,
  result: stage01CriterionResultSchema.nullable(),
  rationale: z.string().trim(),
  evidence: z.array(z.unknown()),
}).strict().superRefine((value, context) => {
  const hasEvidence = value.evidence.length > 0
  const hasRationale = value.rationale.length > 0
  if (!hasEvidence && !hasRationale) {
    context.addIssue({ code: 'custom', path: ['rationale'], message: 'Rationale or evidence is required' })
  }
  if (value.applicability === 'applicable' && value.result === null) {
    context.addIssue({ code: 'custom', path: ['result'], message: 'Applicable criteria require a result' })
  }
  if (value.applicability === 'not_applicable' && value.result !== null) {
    context.addIssue({ code: 'custom', path: ['result'], message: 'Not-applicable criteria cannot have a result' })
  }
})
export type CriterionEvaluationRevisionInput = z.infer<typeof criterionEvaluationRevisionInputSchema>

export const submitRecommendationInputSchema = z.object({
  expectedCycleVersion: versionSchema,
  recommendation: stage01RecommendationValueSchema,
  rationale: meaningfulTextSchema,
  evidence: z.array(z.unknown()),
}).strict()
export type SubmitRecommendationInput = z.infer<typeof submitRecommendationInputSchema>

export const returnForClarificationInputSchema = z.object({
  expectedCycleVersion: versionSchema,
  recommendationId: uuidSchema,
  reason: meaningfulTextSchema,
}).strict()
export type ReturnForClarificationInput = z.infer<typeof returnForClarificationInputSchema>

export const recordFinalDecisionInputSchema = z.object({
  expectedCycleVersion: versionSchema,
  outcome: stage01FinalOutcomeSchema,
  rationale: meaningfulTextSchema,
  overrideRationale: meaningfulTextSchema.optional(),
}).strict()
export type RecordFinalDecisionInput = z.infer<typeof recordFinalDecisionInputSchema>

export const reactivateStage01InputSchema = z.object({
  expectedOpportunityVersion: versionSchema,
  expectedExecutionVersion: versionSchema,
  expectedCycleVersion: versionSchema,
  reason: meaningfulTextSchema,
}).strict()
export type ReactivateStage01Input = z.infer<typeof reactivateStage01InputSchema>
