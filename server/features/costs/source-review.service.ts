import type { PermissionCode } from '../../../shared/constants/permissions'
import { createSourceReviewIssueInputSchema, resolveSourceReviewIssueInputSchema } from '../../../shared/schemas/costs/sources'
import { AppApiError } from '../../utils/api-error'
type Context = { actorId: string; tenantId: string; companyId: string; permissions: readonly PermissionCode[]; requestId: string }
type Repository = { createIssue(input: Record<string, unknown>): Promise<unknown>; getIssue(input: Record<string, unknown>): Promise<{ status: string } | null>; resolveIssue(input: Record<string, unknown>): Promise<unknown> }
function requirePrepare(context: Context) { if (!context.permissions.includes('cost.source.read') || !context.permissions.includes('cost.prepare')) throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền đối chiếu nguồn.') }
export function createSourceReviewService(repository: Repository) { return {
  async create(context: Context, selectionId: string, input: unknown) { requirePrepare(context); return repository.createIssue({ ...createSourceReviewIssueInputSchema.parse(input), selectionId, tenantId: context.tenantId, companyId: context.companyId, actorId: context.actorId, requestId: context.requestId, financialActivation: false }) },
  async resolve(context: Context, issueId: string, input: unknown) { requirePrepare(context); const issue = await repository.getIssue({ issueId, tenantId: context.tenantId, companyId: context.companyId }); if (!issue) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy vấn đề nguồn.'); if (issue.status === 'resolved') throw new AppApiError(409, 'HISTORY_IMMUTABLE', 'Vấn đề nguồn đã được giải quyết.'); return repository.resolveIssue({ ...resolveSourceReviewIssueInputSchema.parse(input), issueId, tenantId: context.tenantId, companyId: context.companyId, actorId: context.actorId, financialActivation: false }) },
} }
