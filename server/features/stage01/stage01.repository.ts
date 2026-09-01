import { z } from 'zod'
import {
  stage01ClarificationReturnSchema,
  stage01CriterionDefinitionSchema,
  stage01CriterionEvaluationSchema,
  stage01DecisionCycleSchema,
  stage01RecommendationSchema,
} from '../../../shared/schemas/stage01'
import { stage01BusinessTaxonomiesSchema, stage01CriteriaSchema, type Stage01BusinessTaxonomies, type Stage01Criteria } from '../../../shared/schemas/stage01-config'
import { stage01OperationalDetailSchema, type Stage01OperationalDetail } from '../../../shared/schemas/stage01-operational'
import { contactSchema } from '../../../shared/schemas/opportunities'
import type {
  CriterionEvaluationRevisionInput,
  ReactivateStage01Input,
  RecordFinalDecisionInput,
  ReturnForClarificationInput,
  Stage01ClarificationReturn,
  Stage01CriterionEvaluation,
  Stage01Recommendation,
  SubmitRecommendationInput,
} from '../../../shared/schemas/stage01'
import type { UserSupabaseClient } from '../../utils/supabase-client'
import { createSupabaseOpportunityRepository } from '../opportunities/opportunity.repository'
import { createSupabaseWorkflowRepository } from '../workflow/workflow.repository'
import { evaluateStage01EvaluationGates, evaluateStage01IntakeGates } from './stage01-gates'
import { failStage01Database, mapStage01RpcError } from './stage01-errors'

export interface Stage01DataRepository {
  get(companyId: string, opportunityId: string): Promise<Stage01OperationalDetail | null>
  evaluateCriterion(companyId: string, opportunityId: string, criterionKey: string, input: CriterionEvaluationRevisionInput, requestId: string): Promise<void>
  submitRecommendation(companyId: string, opportunityId: string, input: SubmitRecommendationInput, requestId: string): Promise<void>
  returnForClarification(companyId: string, opportunityId: string, input: ReturnForClarificationInput, requestId: string): Promise<void>
  recordFinalDecision(companyId: string, opportunityId: string, input: RecordFinalDecisionInput, requestId: string): Promise<void>
  reactivate(companyId: string, opportunityId: string, input: ReactivateStage01Input, requestId: string): Promise<void>
}

interface QueryResult { data: unknown, error: unknown }
interface Query extends PromiseLike<QueryResult> {
  select(columns: string): Query
  eq(column: string, value: string | boolean): Query
  order(column: string, options?: { ascending?: boolean }): Query
  limit(count: number): Query
  maybeSingle(): Promise<QueryResult>
}
interface Stage01DataClient {
  from(table: string): Query
  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult>
}

const uuid = z.string().uuid()
const version = z.number().int().nonnegative()
const timestamp = z.string().datetime({ offset: true })
const cycleRowSchema = z.object({
  id: uuid, opportunity_id: uuid, node_execution_id: uuid, cycle_no: z.number().int().positive(),
  decision_authority_user_id: uuid.nullable(), authority_resolution_reference: z.string().trim().min(1).nullable(),
  reactivation_reason: z.string().trim().min(1).nullable(), final_outcome: z.enum(['proceed', 'not_proceeding']).nullable(),
  final_decision_by: uuid.nullable(), final_decision_at: timestamp.nullable(), final_rationale: z.string().trim().min(1).nullable(),
  final_recommendation_id: uuid.nullable(), override_rationale: z.string().trim().min(1).nullable(), version,
  created_at: timestamp,
}).strict()
const evaluationRowSchema = z.object({
  id: uuid, decision_cycle_id: uuid, criterion_key: z.string().trim().min(1), revision: z.number().int().positive(),
  applicability: z.enum(['applicable', 'not_applicable']),
  result: z.enum(['fit', 'concern', 'not_fit', 'insufficient_information']).nullable(),
  rationale: z.string().trim().min(1).nullable(), evidence: z.array(z.unknown()), evaluated_by: uuid, evaluated_at: timestamp,
}).strict()
const recommendationRowSchema = z.object({
  id: uuid, decision_cycle_id: uuid, version: z.number().int().positive(),
  recommendation: z.enum(['recommend_proceed', 'recommend_not_proceeding']), rationale: z.string().trim().min(1),
  evidence: z.array(z.unknown()), submitted_by: uuid, submitted_at: timestamp,
}).strict()
const clarificationRowSchema = z.object({
  id: uuid, decision_cycle_id: uuid, recommendation_id: uuid, reason: z.string().trim().min(1),
  returned_by: uuid, returned_at: timestamp,
}).strict()
const contactRowSchema = z.object({
  id: uuid, display_name: z.string().trim().min(1), notes: z.string().trim().min(1).nullable(),
  version, created_at: timestamp, updated_at: timestamp,
}).strict()
const contactMethodRowSchema = z.object({
  id: uuid, contact_id: uuid, method_type: z.enum(['phone', 'email', 'other']), value: z.string().trim().min(1),
  is_usable: z.boolean(), reliability_state: z.enum(['unverified', 'confirmed', 'disputed']).nullable(),
  created_at: timestamp, updated_at: timestamp,
}).strict()
const definitionSchema = z.object({
  criteria: z.array(stage01CriterionDefinitionSchema),
  taxonomies: z.record(z.string(), z.array(z.object({
    code: z.string().trim().min(1),
    behavior: z.object({ requiresReferrer: z.boolean().optional() }).passthrough().optional(),
  }).passthrough())),
  capabilities: z.record(z.string(), z.string().trim().min(1)),
}).passthrough()
const definitionRowSchema = z.object({ definition: definitionSchema }).strict()
const accessRowSchema = z.object({ roles: z.array(z.string()), permissions: z.array(z.string().trim().min(1)) }).strict()

const cycleColumns = 'id, opportunity_id, node_execution_id, cycle_no, decision_authority_user_id, authority_resolution_reference, reactivation_reason, final_outcome, final_decision_by, final_decision_at, final_rationale, final_recommendation_id, override_rationale, version, created_at'
const evaluationColumns = 'id, decision_cycle_id, criterion_key, revision, applicability, result, rationale, evidence, evaluated_by, evaluated_at'
const recommendationColumns = 'id, decision_cycle_id, version, recommendation, rationale, evidence, submitted_by, submitted_at'
const clarificationColumns = 'id, decision_cycle_id, recommendation_id, reason, returned_by, returned_at'
const contactColumns = 'id, display_name, notes, version, created_at, updated_at'
const contactMethodColumns = 'id, contact_id, method_type, value, is_usable, reliability_state, created_at, updated_at'

const criterionCommandResultSchema = z.object({
  opportunityId: uuid, decisionCycleId: uuid, criterionEvaluationId: uuid,
  criterionRevision: z.number().int().positive(), recommendationVersion: z.null(), cycleVersion: version,
}).strict()
const recommendationCommandResultSchema = z.object({
  opportunityId: uuid, decisionCycleId: uuid, recommendationId: uuid,
  criterionRevision: z.null(), recommendationVersion: z.number().int().positive(), cycleVersion: version,
}).strict()
const clarificationCommandResultSchema = z.object({
  opportunityId: uuid, decisionCycleId: uuid, clarificationReturnId: uuid,
  criterionRevision: z.null(), recommendationVersion: z.null(), cycleVersion: version,
}).strict()
const finalDecisionResultSchema = z.object({
  opportunityId: uuid, decisionCycleId: uuid, finalRecommendationId: uuid,
  finalOutcome: z.enum(['proceed', 'not_proceeding']), cycleVersion: version,
}).strict()
const reactivationResultSchema = z.object({
  opportunityId: uuid, previousExecutionId: uuid, previousCycleId: uuid,
  nodeExecutionId: uuid, decisionCycleId: uuid, executionNo: z.number().int().positive(),
  cycleNo: z.number().int().positive(), executionVersion: version, cycleVersion: version, opportunityVersion: version,
}).strict()

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value)
  if (!result.success) return failStage01Database(message)
  return result.data
}
function mapEvaluation(row: z.infer<typeof evaluationRowSchema>): Stage01CriterionEvaluation {
  return stage01CriterionEvaluationSchema.parse({ id: row.id, decisionCycleId: row.decision_cycle_id,
    criterionKey: row.criterion_key, revision: row.revision, applicability: row.applicability,
    result: row.result, rationale: row.rationale, evidence: row.evidence,
    evaluatedBy: row.evaluated_by, evaluatedAt: row.evaluated_at })
}
function mapRecommendation(row: z.infer<typeof recommendationRowSchema>): Stage01Recommendation {
  return stage01RecommendationSchema.parse({ id: row.id, decisionCycleId: row.decision_cycle_id,
    version: row.version, recommendation: row.recommendation, rationale: row.rationale, evidence: row.evidence,
    submittedBy: row.submitted_by, submittedAt: row.submitted_at })
}
function mapClarification(row: z.infer<typeof clarificationRowSchema>): Stage01ClarificationReturn {
  return stage01ClarificationReturnSchema.parse({ id: row.id, decisionCycleId: row.decision_cycle_id,
    recommendationId: row.recommendation_id, reason: row.reason,
    returnedBy: row.returned_by, returnedAt: row.returned_at })
}
function mapContact(row: z.infer<typeof contactRowSchema>, methods: z.infer<typeof contactMethodRowSchema>[]) {
  return contactSchema.parse({
    id: row.id, displayName: row.display_name, notes: row.notes, version: row.version,
    methods: methods.map(method => ({
      id: method.id, contactId: method.contact_id, methodType: method.method_type, value: method.value,
      isUsable: method.is_usable, reliabilityState: method.reliability_state,
      createdAt: method.created_at, updatedAt: method.updated_at,
    })),
    createdAt: row.created_at, updatedAt: row.updated_at,
  })
}
function businessConfiguration(definition: z.infer<typeof definitionSchema>): { taxonomies: Stage01BusinessTaxonomies, criteria: Stage01Criteria } {
  const taxonomies = stage01BusinessTaxonomiesSchema.parse(Object.fromEntries(Object.entries(definition.taxonomies).map(([key, values]) => [key, values.map((value) => {
    const entry = value as { code: string, label: unknown, behavior?: { requiresReferrer?: boolean } }
    if (key === 'lead_source') {
      return entry.behavior === undefined
        ? { code: entry.code, label: entry.label }
        : { code: entry.code, label: entry.label, behavior: { requiresReferrer: entry.behavior.requiresReferrer === true } }
    }
    return { code: entry.code, label: entry.label }
  })])))
  return { taxonomies, criteria: stage01CriteriaSchema.parse(definition.criteria) }
}

export function createSupabaseStage01Repository(db: UserSupabaseClient): Stage01DataRepository {
  const client = db as unknown as Stage01DataClient
  const opportunities = createSupabaseOpportunityRepository(db)
  const workflow = createSupabaseWorkflowRepository(db)

  async function rpc<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, message: string): Promise<T> {
    const { data, error } = await client.rpc(name, args)
    if (error) return mapStage01RpcError(error, message)
    return parse(schema, data, message)
  }
  async function cycleResources<T>(table: string, columns: string, companyId: string, cycleId: string, schema: z.ZodType<T>, message: string): Promise<T[]> {
    const { data, error } = await client.from(table).select(columns).eq('company_id', companyId).eq('decision_cycle_id', cycleId)
    if (error) return failStage01Database(message)
    return parse(z.array(schema), data, message)
  }
  async function relatedContact(companyId: string, contactId: string) {
    const [contactResult, methodResult] = await Promise.all([
      client.from('contacts').select(contactColumns).eq('company_id', companyId).eq('id', contactId).maybeSingle(),
      client.from('contact_methods').select(contactMethodColumns).eq('company_id', companyId).eq('contact_id', contactId).order('created_at'),
    ])
    if (contactResult.error || contactResult.data === null || methodResult.error) return failStage01Database('Không thể đọc Contact liên quan.')
    return mapContact(
      parse(contactRowSchema, contactResult.data, 'Không thể đọc Contact liên quan.'),
      parse(z.array(contactMethodRowSchema), methodResult.data, 'Không thể đọc Contact Method liên quan.'),
    )
  }

  return {
    async get(companyId, opportunityId) {
      const [opportunity, workflowRuntime] = await Promise.all([
        opportunities.getById(companyId, opportunityId), workflow.getForOpportunity(companyId, opportunityId),
      ])
      if (opportunity === null || workflowRuntime === null) return null
      const intake = workflowRuntime.nodes.find(node => node.nodeKey === '01.1')
      const evaluation = workflowRuntime.nodes.find(node => node.nodeKey === '01.2')
      if (!intake || !evaluation) return failStage01Database('Stage 01 runtime không đầy đủ.')

      const cycleResult = await client.from('stage01_decision_cycles').select(cycleColumns)
        .eq('company_id', companyId).eq('opportunity_id', opportunityId).order('cycle_no')
      if (cycleResult.error) return failStage01Database('Không thể đọc Decision Cycle.')
      const cycleRows = parse(z.array(cycleRowSchema).min(1), cycleResult.data, 'Không thể đọc Decision Cycle.')
      const [definitionResult, accessResult, relatedContacts] = await Promise.all([
        client.from('workflow_definition_snapshots').select('definition').eq('company_id', companyId).eq('id', workflowRuntime.definitionSnapshotId).maybeSingle(),
        client.rpc('get_my_company_access', { target_company_id: companyId }),
        Promise.all([...new Set(opportunity.contacts.map(contact => contact.contactId))].sort().map(contactId => relatedContact(companyId, contactId))),
      ])
      if (definitionResult.error || definitionResult.data === null || accessResult.error) {
        return failStage01Database('Không thể đọc cấu hình Stage 01.')
      }
      const definition = parse(definitionRowSchema, definitionResult.data, 'Không thể đọc cấu hình Stage 01.').definition
      const access = parse(z.array(accessRowSchema).length(1), accessResult.data, 'Không thể đọc quyền Stage 01.')[0]!
      const decisionCycles = await Promise.all(cycleRows.map(async (cycleRow) => {
        const [evaluationRows, recommendationRows, clarificationRows] = await Promise.all([
          cycleResources('stage01_criterion_evaluations', evaluationColumns, companyId, cycleRow.id, evaluationRowSchema, 'Không thể đọc criterion evaluations.'),
          cycleResources('stage01_recommendations', recommendationColumns, companyId, cycleRow.id, recommendationRowSchema, 'Không thể đọc recommendations.'),
          cycleResources('stage01_clarification_returns', clarificationColumns, companyId, cycleRow.id, clarificationRowSchema, 'Không thể đọc clarification returns.'),
        ])
        return stage01DecisionCycleSchema.parse({
          id: cycleRow.id, opportunityId: cycleRow.opportunity_id, nodeExecutionId: cycleRow.node_execution_id,
          cycleNo: cycleRow.cycle_no, decisionAuthorityUserId: cycleRow.decision_authority_user_id,
          authorityResolutionReference: cycleRow.authority_resolution_reference, reactivationReason: cycleRow.reactivation_reason,
          finalOutcome: cycleRow.final_outcome, finalDecisionBy: cycleRow.final_decision_by,
          finalDecisionAt: cycleRow.final_decision_at, finalRationale: cycleRow.final_rationale,
          finalRecommendationId: cycleRow.final_recommendation_id, overrideRationale: cycleRow.override_rationale,
          version: cycleRow.version,
          evaluations: evaluationRows.map(mapEvaluation).sort((left, right) => left.evaluatedAt.localeCompare(right.evaluatedAt)),
          recommendations: recommendationRows.map(mapRecommendation).sort((left, right) => left.version - right.version),
          clarificationReturns: clarificationRows.map(mapClarification).sort((left, right) => left.returnedAt.localeCompare(right.returnedAt)),
          createdAt: cycleRow.created_at,
        })
      }))
      const decisionCycle = decisionCycles[decisionCycles.length - 1]!

      const primaryContact = opportunity.contacts.find(contact => contact.isPrimary && contact.endedAt === null)
      const usableContactMethodCount = primaryContact === undefined
        ? 0
        : relatedContacts.find(contact => contact.id === primaryContact.contactId)?.methods.filter(method => method.isUsable).length ?? 0
      const leadSourceValues = definition.taxonomies.lead_source ?? []
      const leadSourceRequiresReferrer = leadSourceValues.find(value => value.code === opportunity.primaryLeadSourceCode)
        ?.behavior?.requiresReferrer === true
      const intakeGates = evaluateStage01IntakeGates({
        validityState: opportunity.validityState,
        hasIntakeOwner: intake.assignments.some(assignment => assignment.assignmentKind === 'accountable_owner' && assignment.endedAt === null),
        primaryCustomerName: opportunity.primaryCustomerName, customerTypeCode: opportunity.customerTypeCode,
        hasActivePrimaryContact: primaryContact !== undefined,
        primaryContactRelationshipCode: primaryContact?.relationshipCode ?? null,
        usableContactMethodCount,
        activeScopeCount: opportunity.scopes.filter(scope => scope.retiredAt === null).length,
        needDescription: opportunity.needDescription, locationStatus: opportunity.locationStatus,
        primaryLeadSourceCode: opportunity.primaryLeadSourceCode, leadSourceRequiresReferrer,
        activePrimaryReferrerCount: opportunity.referrers.filter(referrer => referrer.isPrimary && referrer.endedAt === null).length,
        engagementStatusCode: opportunity.engagementStatusCode, intakeRecordCount: opportunity.intakeRecords.length,
        openBlockingBlockerCount: intake.blockers.filter(blocker => blocker.effect === 'blocking' && blocker.resolvedAt === null).length,
        unresolvedDuplicateConcernCount: opportunity.duplicateConcerns.filter(concern => concern.resolvedAt === null).length,
      })
      const evaluationGates = evaluateStage01EvaluationGates({
        criterionDefinitions: definition.criteria,
        evaluations: decisionCycle.evaluations, recommendations: decisionCycle.recommendations,
        clarificationReturns: decisionCycle.clarificationReturns,
        intakeDependencyCurrentlyValid: intake.phase === 'completed' && !intake.needsRevalidation,
        hasOpenBlockingBlocker: evaluation.blockers.some(blocker => blocker.effect === 'blocking' && blocker.resolvedAt === null),
        needsRevalidation: evaluation.needsRevalidation, finalOutcome: decisionCycle.finalOutcome,
      })
      const allowedPermissions = new Set(access.permissions)
      const actorCapabilities = Object.entries(definition.capabilities)
        .filter(([, permission]) => allowedPermissions.has(permission))
        .map(([capability]) => capability)
        .sort()
      return stage01OperationalDetailSchema.parse({
        opportunity, intake: { runtime: intake, gates: intakeGates }, evaluation: { runtime: evaluation, gates: evaluationGates },
        currentDecisionCycle: decisionCycle, actorCapabilities, configuration: businessConfiguration(definition), relatedContacts, decisionCycles,
      })
    },
    async evaluateCriterion(companyId, opportunityId, criterionKey, input, requestId) {
      await rpc('record_stage01_criterion_evaluation', { target_company_id: companyId, target_opportunity_id: opportunityId,
        target_criterion_key: criterionKey, target_input: input, target_request_id: requestId },
      criterionCommandResultSchema, 'Không thể ghi nhận criterion evaluation.')
    },
    async submitRecommendation(companyId, opportunityId, input, requestId) {
      await rpc('submit_stage01_recommendation', { target_company_id: companyId, target_opportunity_id: opportunityId,
        target_input: input, target_request_id: requestId }, recommendationCommandResultSchema, 'Không thể gửi Recommendation.')
    },
    async returnForClarification(companyId, opportunityId, input, requestId) {
      await rpc('return_stage01_for_clarification', { target_company_id: companyId, target_opportunity_id: opportunityId,
        target_input: input, target_request_id: requestId }, clarificationCommandResultSchema, 'Không thể return for clarification.')
    },
    async recordFinalDecision(companyId, opportunityId, input, requestId) {
      await rpc('record_stage01_final_decision', { target_company_id: companyId, target_opportunity_id: opportunityId,
        target_input: input, target_request_id: requestId }, finalDecisionResultSchema, 'Không thể ghi nhận Final Decision.')
    },
    async reactivate(companyId, opportunityId, input, requestId) {
      await rpc('reactivate_stage01', { target_company_id: companyId, target_opportunity_id: opportunityId,
        target_input: input, target_request_id: requestId }, reactivationResultSchema, 'Không thể reactivate Stage 01.')
    },
  }
}
