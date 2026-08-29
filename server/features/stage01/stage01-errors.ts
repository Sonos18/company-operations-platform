import { z } from 'zod'
import type { ApiErrorCode } from '../../../shared/schemas/api-error'
import { AppApiError } from '../../utils/api-error'

const databaseErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
}).passthrough()

const mappings: Record<string, { status: number, code: ApiErrorCode, message: string }> = {
  AUTH_REQUIRED: { status: 401, code: 'AUTH_REQUIRED', message: 'Bạn cần đăng nhập để tiếp tục.' },
  COMPANY_FORBIDDEN: { status: 403, code: 'COMPANY_FORBIDDEN', message: 'Bạn không có quyền truy cập công ty này.' },
  PERMISSION_DENIED: { status: 403, code: 'PERMISSION_DENIED', message: 'Bạn không có quyền thực hiện thao tác này.' },
  OPPORTUNITY_NOT_FOUND: { status: 404, code: 'OPPORTUNITY_NOT_FOUND', message: 'Không tìm thấy Opportunity.' },
  WORKFLOW_RESOURCE_NOT_FOUND: { status: 404, code: 'OPPORTUNITY_NOT_FOUND', message: 'Không tìm thấy Workflow runtime.' },
  VERSION_CONFLICT: { status: 409, code: 'VERSION_CONFLICT', message: 'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.' },
  STAGE01_DEFINITION_CONFIG_UNAVAILABLE: { status: 409, code: 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE', message: 'Cấu hình Stage 01 chưa sẵn sàng.' },
  STAGE01_DEFINITION_CONFIG_INVALID: { status: 409, code: 'STAGE01_DEFINITION_CONFIG_INVALID', message: 'Cấu hình Stage 01 không hợp lệ.' },
  STAGE01_EVALUATION_CONFIG_UNAVAILABLE: { status: 409, code: 'STAGE01_EVALUATION_CONFIG_UNAVAILABLE', message: 'Cấu hình đánh giá Stage 01 chưa sẵn sàng.' },
  STAGE01_NODE_NOT_STARTABLE: { status: 409, code: 'WORKFLOW_NODE_NOT_READY', message: 'Workflow node chưa sẵn sàng.' },
  STAGE01_ACCOUNTABLE_OWNER_REQUIRED: { status: 409, code: 'WORKFLOW_OWNER_REQUIRED', message: 'Workflow node cần Accountable Owner.' },
  STAGE01_DEPENDENCY_NOT_SATISFIED: { status: 409, code: 'WORKFLOW_NODE_NOT_READY', message: 'Dependency của Workflow node chưa hợp lệ.' },
  STAGE01_INTAKE_NOT_COMPLETABLE: { status: 409, code: 'STAGE01_INTAKE_INCOMPLETE', message: 'Intake chưa đủ điều kiện hoàn tất.' },
  STAGE01_INTAKE_GATES_NOT_SATISFIED: { status: 409, code: 'STAGE01_INTAKE_INCOMPLETE', message: 'Intake chưa đủ điều kiện hoàn tất.' },
  STAGE01_EVALUATION_GATES_NOT_SATISFIED: { status: 409, code: 'STAGE01_EVALUATION_INCOMPLETE', message: 'Evaluation chưa đủ điều kiện.' },
  STAGE01_CURRENT_RECOMMENDATION_REQUIRED: { status: 409, code: 'STAGE01_RECOMMENDATION_REQUIRED', message: 'Cần Recommendation hiện hành.' },
  STAGE01_DECISION_AUTHORITY_UNRESOLVED: { status: 409, code: 'STAGE01_DECISION_AUTHORITY_UNRESOLVED', message: 'Decision Authority chưa được xác định.' },
  STAGE01_DECISION_AUTHORITY_MISMATCH: { status: 403, code: 'STAGE01_DECISION_AUTHORITY_MISMATCH', message: 'Bạn không phải Decision Authority của cycle này.' },
  STAGE01_FINAL_DECISION_EXISTS: { status: 409, code: 'STAGE01_FINAL_DECISION_EXISTS', message: 'Final Decision đã tồn tại.' },
  STAGE01_OVERRIDE_RATIONALE_REQUIRED: { status: 409, code: 'STAGE01_OVERRIDE_RATIONALE_REQUIRED', message: 'Cần lý do override Recommendation.' },
  STAGE01_DECISION_OVERRIDE_INVALID: { status: 409, code: 'STAGE01_OVERRIDE_RATIONALE_REQUIRED', message: 'Override rationale không hợp lệ.' },
  STAGE01_NOT_REACTIVATABLE: { status: 409, code: 'STAGE01_REACTIVATION_NOT_ALLOWED', message: 'Stage 01 không đủ điều kiện Reactivation.' },
  STAGE01_INTAKE_REVALIDATION_REQUIRED: { status: 409, code: 'STAGE01_INTAKE_REVALIDATION_REQUIRED', message: 'Intake cần được revalidate trước.' },
  STAGE01_HISTORY_IMMUTABLE: { status: 409, code: 'STAGE01_HISTORY_IMMUTABLE', message: 'Lịch sử Stage 01 là bất biến.' },
  STAGE01_RESOURCE_ALREADY_ENDED: { status: 409, code: 'STAGE01_RESOURCE_ALREADY_ENDED', message: 'Resource đã kết thúc.' },
  STAGE01_RESOURCE_ALREADY_RETIRED: { status: 409, code: 'STAGE01_RESOURCE_ALREADY_RETIRED', message: 'Resource đã retire.' },
}

export function failStage01Database(message: string): never {
  throw new AppApiError(500, 'INTERNAL_ERROR', message)
}

export function mapStage01RpcError(error: unknown, fallbackMessage: string): never {
  const parsed = databaseErrorSchema.safeParse(error)
  if (parsed.success && parsed.data.code === 'P0001' && parsed.data.message) {
    const mapped = mappings[parsed.data.message]
    if (mapped) throw new AppApiError(mapped.status, mapped.code, mapped.message)
  }
  return failStage01Database(fallbackMessage)
}
