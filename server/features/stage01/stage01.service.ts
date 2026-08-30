import type { PermissionCode } from '../../../shared/constants/permissions'
import type {
  CriterionEvaluationRevisionInput,
  ReactivateStage01Input,
  RecordFinalDecisionInput,
  ReturnForClarificationInput,
  SubmitRecommendationInput,
} from '../../../shared/schemas/stage01'
import { AppApiError } from '../../utils/api-error'
import type { Stage01DataRepository } from './stage01.repository'

export interface Stage01ServiceContext {
  actorId: string
  tenantId: string
  companyId: string
  permissions: readonly PermissionCode[]
  requestId: string
}

function requirePermission(context: Stage01ServiceContext, permission: PermissionCode): void {
  if (!context.permissions.includes(permission)) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}

function notFound(): never {
  throw new AppApiError(404, 'OPPORTUNITY_NOT_FOUND', 'Không tìm thấy Stage 01 aggregate.')
}

export function createStage01Service(repository: Stage01DataRepository) {
  return {
    async get(context: Stage01ServiceContext, opportunityId: string) {
      requirePermission(context, 'opportunity.read')
      requirePermission(context, 'journey.read')
      return await repository.get(context.companyId, opportunityId) ?? notFound()
    },
    async evaluateCriterion(context: Stage01ServiceContext, opportunityId: string, criterionKey: string, input: CriterionEvaluationRevisionInput) {
      requirePermission(context, 'stage01.evaluation.update')
      return repository.evaluateCriterion(context.companyId, opportunityId, criterionKey, input, context.requestId)
    },
    async submitRecommendation(context: Stage01ServiceContext, opportunityId: string, input: SubmitRecommendationInput) {
      requirePermission(context, 'stage01.recommendation.submit')
      return repository.submitRecommendation(context.companyId, opportunityId, input, context.requestId)
    },
    async returnForClarification(context: Stage01ServiceContext, opportunityId: string, input: ReturnForClarificationInput) {
      requirePermission(context, 'stage01.clarification.return')
      return repository.returnForClarification(context.companyId, opportunityId, input, context.requestId)
    },
    async recordFinalDecision(context: Stage01ServiceContext, opportunityId: string, input: RecordFinalDecisionInput) {
      requirePermission(context, 'stage01.decision.record')
      return repository.recordFinalDecision(context.companyId, opportunityId, input, context.requestId)
    },
    async reactivate(context: Stage01ServiceContext, opportunityId: string, input: ReactivateStage01Input) {
      requirePermission(context, 'stage01.reactivate')
      return repository.reactivate(context.companyId, opportunityId, input, context.requestId)
    },
  }
}
