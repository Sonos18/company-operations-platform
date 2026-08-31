import type { PermissionCode } from '../../../shared/constants/permissions'
import type {
  CreateStage01ConfigDraftInput,
  DiscardStage01ConfigDraftInput,
  PublishStage01ConfigDraftInput,
  UpdateStage01ConfigDraftInput,
} from '../../../shared/schemas/stage01-config'
import { AppApiError } from '../../utils/api-error'
import type { Stage01ServiceContext } from '../stage01/stage01.service'
import type { Stage01ConfigDataRepository } from './stage01-config.repository'

function requirePermission(context: Stage01ServiceContext, permission: PermissionCode): void {
  if (!context.permissions.includes(permission)) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}

export function createStage01ConfigService(repository: Stage01ConfigDataRepository) {
  return {
    async get(context: Stage01ServiceContext) {
      requirePermission(context, 'stage01.config.read')
      return repository.get(context.companyId)
    },
    async createDraft(context: Stage01ServiceContext, input: CreateStage01ConfigDraftInput) {
      requirePermission(context, 'stage01.config.update')
      return repository.createDraft(context.companyId, input, context.requestId)
    },
    async updateDraft(context: Stage01ServiceContext, input: UpdateStage01ConfigDraftInput) {
      requirePermission(context, 'stage01.config.update')
      return repository.updateDraft(context.companyId, input, context.requestId)
    },
    async discardDraft(context: Stage01ServiceContext, input: DiscardStage01ConfigDraftInput) {
      requirePermission(context, 'stage01.config.update')
      return repository.discardDraft(context.companyId, input, context.requestId)
    },
    async publishDraft(context: Stage01ServiceContext, input: PublishStage01ConfigDraftInput) {
      requirePermission(context, 'stage01.config.publish')
      return repository.publishDraft(context.companyId, input, context.requestId)
    },
  }
}
