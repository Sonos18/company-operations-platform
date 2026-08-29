import { describe, expect, it } from 'vitest'
import { permissionCodes } from '../../../shared/constants/permissions'
import { apiErrorCodeSchema } from '../../../shared/schemas/api-error'
import {
  createContactInputSchema,
  createOpportunityInputSchema,
  reliabilityStateSchema,
  setPrimaryContactInputSchema,
} from '../../../shared/schemas/opportunities'
import {
  criterionEvaluationRevisionInputSchema,
  stage01FinalOutcomeSchema,
  stage01RecommendationValueSchema,
} from '../../../shared/schemas/stage01'
import {
  completeWorkflowNodeInputSchema,
  startWorkflowNodeInputSchema,
  workflowInternalPhaseSchema,
  workflowNodeStateSchema,
} from '../../../shared/schemas/workflow'

const ids = {
  contact: '10000000-0000-4000-8000-000000000401',
  actor: '10000000-0000-4000-8000-000000000101',
  company: '10000000-0000-4000-8000-000000000020',
}

describe('Stage 01 shared schemas', () => {
  it('keeps derived workflow state separate from persisted phase', () => {
    expect(workflowNodeStateSchema.options).toEqual([
      'locked',
      'ready',
      'active',
      'blocked',
      'completed',
      'not_applicable',
    ])
    expect(workflowInternalPhaseSchema.options).toEqual([
      'not_started',
      'active',
      'completed',
      'not_applicable',
    ])
  })

  it('accepts only approved outcomes and keeps reliability metadata independent', () => {
    expect(stage01FinalOutcomeSchema.options).toEqual(['proceed', 'not_proceeding'])
    expect(stage01RecommendationValueSchema.options).toEqual([
      'recommend_proceed',
      'recommend_not_proceeding',
    ])
    expect(reliabilityStateSchema.options).toEqual(['unverified', 'confirmed', 'disputed'])
  })

  it('uses the owning aggregate version and rejects client-supplied authority context', () => {
    expect(startWorkflowNodeInputSchema.parse({ expectedExecutionVersion: 1 })).toEqual({
      expectedExecutionVersion: 1,
    })
    expect(completeWorkflowNodeInputSchema.parse({
      expectedOpportunityVersion: 2,
      expectedExecutionVersion: 3,
    })).toEqual({ expectedOpportunityVersion: 2, expectedExecutionVersion: 3 })
    expect(startWorkflowNodeInputSchema.safeParse({
      expectedExecutionVersion: 1,
      actorId: ids.actor,
    }).success).toBe(false)
    expect(createOpportunityInputSchema.safeParse({
      primaryCustomerName: 'Công ty thử nghiệm',
      companyId: ids.company,
    }).success).toBe(false)
  })

  it('keeps Contact creation separate from setting an Opportunity primary relationship', () => {
    expect(createContactInputSchema.parse({ displayName: 'Nguyễn Văn A' })).toEqual({
      displayName: 'Nguyễn Văn A',
    })
    expect(setPrimaryContactInputSchema.parse({
      contactId: ids.contact,
      relationshipCode: 'technical_contact',
      reliabilityState: 'confirmed',
      expectedOpportunityVersion: 4,
    })).toEqual({
      contactId: ids.contact,
      relationshipCode: 'technical_contact',
      reliabilityState: 'confirmed',
      expectedOpportunityVersion: 4,
    })
    expect(setPrimaryContactInputSchema.safeParse({
      contact: { displayName: 'Nested contact must be rejected' },
      relationshipCode: 'technical_contact',
      expectedOpportunityVersion: 4,
    }).success).toBe(false)
  })

  it('represents N/A independently from applicable evaluation results', () => {
    expect(criterionEvaluationRevisionInputSchema.parse({
      expectedCycleVersion: 3,
      applicability: 'not_applicable',
      result: null,
      rationale: 'Tiêu chí không áp dụng trong phạm vi này',
      evidence: [],
    })).toEqual({
      expectedCycleVersion: 3,
      applicability: 'not_applicable',
      result: null,
      rationale: 'Tiêu chí không áp dụng trong phạm vi này',
      evidence: [],
    })
    expect(criterionEvaluationRevisionInputSchema.safeParse({
      expectedCycleVersion: 3,
      applicability: 'applicable',
      result: null,
      rationale: '',
      evidence: [],
    }).success).toBe(false)
  })

  it('extends the existing catalogs with every approved Stage 01 permission and error', () => {
    const stage01Permissions = [
      'opportunity.read',
      'opportunity.create',
      'opportunity.update',
      'opportunity.contact.manage',
      'opportunity.scope.manage',
      'opportunity.referrer.manage',
      'opportunity.intake_record.create',
      'opportunity.duplicate.raise',
      'opportunity.duplicate.resolve',
      'opportunity.invalidate',
      'opportunity.restore',
      'journey.read',
      'journey.assignment.manage',
      'journey.node.start',
      'journey.node.complete',
      'journey.node.reopen',
      'journey.node.revalidate',
      'journey.blocker.raise',
      'journey.blocker.resolve',
      'stage01.evaluation.update',
      'stage01.recommendation.submit',
      'stage01.clarification.return',
      'stage01.decision.record',
      'stage01.reactivate',
    ] as const
    const stage01Errors = [
      'OPPORTUNITY_NOT_FOUND',
      'OPPORTUNITY_INVALID',
      'STAGE01_DEFINITION_CONFIG_UNAVAILABLE',
      'STAGE01_DEFINITION_CONFIG_INVALID',
      'WORKFLOW_NODE_NOT_READY',
      'WORKFLOW_NODE_NOT_ACTIVE',
      'WORKFLOW_OWNER_REQUIRED',
      'WORKFLOW_NODE_BLOCKED',
      'WORKFLOW_REVALIDATION_REQUIRED',
      'STAGE01_INTAKE_INCOMPLETE',
      'STAGE01_DUPLICATE_UNRESOLVED',
      'STAGE01_EVALUATION_CONFIG_UNAVAILABLE',
      'STAGE01_EVALUATION_INCOMPLETE',
      'STAGE01_RECOMMENDATION_REQUIRED',
      'STAGE01_CLARIFICATION_PENDING',
      'STAGE01_DECISION_AUTHORITY_UNRESOLVED',
      'STAGE01_DECISION_AUTHORITY_MISMATCH',
      'STAGE01_FINAL_DECISION_EXISTS',
      'STAGE01_OVERRIDE_RATIONALE_REQUIRED',
      'STAGE01_REACTIVATION_NOT_ALLOWED',
      'STAGE01_INTAKE_REVALIDATION_REQUIRED',
      'STAGE01_HISTORY_IMMUTABLE',
      'STAGE01_RESOURCE_ALREADY_ENDED',
      'STAGE01_RESOURCE_ALREADY_RETIRED',
      'VERSION_CONFLICT',
    ] as const

    for (const permission of stage01Permissions) expect(permissionCodes).toContain(permission)
    for (const error of stage01Errors) expect(apiErrorCodeSchema.safeParse(error).success).toBe(true)
    expect(apiErrorCodeSchema.safeParse('OPPORTUNITY_VERSION_CONFLICT').success).toBe(false)
  })
})
