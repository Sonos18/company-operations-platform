import type { PermissionCode } from '../../../shared/constants/permissions'
import type {
  AssignWorkflowNodeInput,
  CompleteWorkflowNodeInput,
  EndWorkflowAssignmentInput,
  RaiseWorkflowBlockerInput,
  ReopenWorkflowNodeInput,
  ResolveWorkflowBlockerInput,
  RevalidateWorkflowNodeInput,
  StartWorkflowNodeInput,
} from '../../../shared/schemas/workflow'
import { AppApiError } from '../../utils/api-error'
import type { Stage01ServiceContext } from '../stage01/stage01.service'
import type { WorkflowDataRepository } from './workflow.repository'

function requirePermission(context: Stage01ServiceContext, permission: PermissionCode): void {
  if (!context.permissions.includes(permission)) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}

function notFound(): never {
  throw new AppApiError(404, 'OPPORTUNITY_NOT_FOUND', 'Không tìm thấy Workflow runtime.')
}

export function createWorkflowService(repository: WorkflowDataRepository) {
  return {
    async getForOpportunity(context: Stage01ServiceContext, opportunityId: string) {
      requirePermission(context, 'journey.read')
      return await repository.getForOpportunity(context.companyId, opportunityId) ?? notFound()
    },
    async startNode(context: Stage01ServiceContext, executionId: string, input: StartWorkflowNodeInput) {
      requirePermission(context, 'journey.node.start')
      return repository.startNode(context.companyId, executionId, input, context.requestId)
    },
    async completeNode(context: Stage01ServiceContext, executionId: string, input: CompleteWorkflowNodeInput) {
      requirePermission(context, 'journey.node.complete')
      const identity = await repository.getNodeIdentity(context.companyId, executionId)
      if (identity === '01.1') return repository.completeIntake(context.companyId, executionId, input, context.requestId)
      if (identity === '01.2') return repository.completeEvaluation(context.companyId, executionId, input, context.requestId)
      return notFound()
    },
    async reopenNode(context: Stage01ServiceContext, executionId: string, input: ReopenWorkflowNodeInput) {
      requirePermission(context, 'journey.node.reopen')
      return repository.reopenNode(context.companyId, executionId, input, context.requestId)
    },
    async revalidateNode(context: Stage01ServiceContext, executionId: string, input: RevalidateWorkflowNodeInput) {
      requirePermission(context, 'journey.node.revalidate')
      return repository.revalidateNode(context.companyId, executionId, input, context.requestId)
    },
    async assign(context: Stage01ServiceContext, executionId: string, input: AssignWorkflowNodeInput) {
      requirePermission(context, 'journey.assignment.manage')
      return repository.assign(context.companyId, executionId, input, context.requestId)
    },
    async endAssignment(context: Stage01ServiceContext, assignmentId: string, input: EndWorkflowAssignmentInput) {
      requirePermission(context, 'journey.assignment.manage')
      return repository.endAssignment(context.companyId, assignmentId, input, context.requestId)
    },
    async raiseBlocker(context: Stage01ServiceContext, executionId: string, input: RaiseWorkflowBlockerInput) {
      requirePermission(context, 'journey.blocker.raise')
      return repository.raiseBlocker(context.companyId, executionId, input, context.requestId)
    },
    async resolveBlocker(context: Stage01ServiceContext, blockerId: string, input: ResolveWorkflowBlockerInput) {
      requirePermission(context, 'journey.blocker.resolve')
      return repository.resolveBlocker(context.companyId, blockerId, input, context.requestId)
    },
  }
}
