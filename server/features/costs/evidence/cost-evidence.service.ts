import type { PermissionCode } from '../../../../shared/constants/permissions'
import { costEvidenceCreateIntentInputSchema, costEvidenceDetailLinkInputSchema, costEvidenceFinalizeInputSchema, costEvidenceLinkInputSchema, costEvidenceReadUrlInputSchema } from '../../../../shared/schemas/costs/cost-evidence'
import { AppApiError } from '../../../utils/api-error'
import type { CostEvidenceRepository } from './cost-evidence.repository'

export interface CostEvidenceServiceContext { actorId: string; tenantId: string; companyId: string; permissions: readonly PermissionCode[]; requestId: string }
function requirePermission(context: CostEvidenceServiceContext, permission: PermissionCode) { if (!context.permissions.includes(permission)) throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.') }
function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T { try { return schema.parse(value) } catch { throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu không hợp lệ.') } }

export class CostEvidenceService {
  constructor(private readonly repository: CostEvidenceRepository) {}
  async createIntent(context: CostEvidenceServiceContext, projectId: string, value: unknown, idempotencyKey: string) { requirePermission(context, 'cost.prepare'); return this.repository.createIntent(context, projectId, parse(costEvidenceCreateIntentInputSchema, value), idempotencyKey) }
  async finalize(context: CostEvidenceServiceContext, evidenceFileId: string, value: unknown, idempotencyKey: string) { requirePermission(context, 'cost.prepare'); return this.repository.finalize(context, evidenceFileId, parse(costEvidenceFinalizeInputSchema, value), idempotencyKey) }
  async linkCost(context: CostEvidenceServiceContext, projectCostItemId: string, value: unknown, idempotencyKey: string) { requirePermission(context, 'cost.prepare'); return this.repository.linkCost(context, projectCostItemId, parse(costEvidenceLinkInputSchema, value), idempotencyKey) }
  async listCostEvidence(context: CostEvidenceServiceContext, projectCostItemId: string) { requirePermission(context, 'cost.source.read'); return this.repository.listCostEvidence(context, projectCostItemId) }
  async linkDetail(context: CostEvidenceServiceContext, detailId: string, value: unknown, idempotencyKey: string) { requirePermission(context, 'cost.prepare'); return this.repository.linkDetail(context, detailId, parse(costEvidenceDetailLinkInputSchema, value), idempotencyKey) }
  async listDetailEvidence(context: CostEvidenceServiceContext, detailId: string) { requirePermission(context, 'cost.source.read'); return this.repository.listDetailEvidence(context, detailId) }
  async createReadUrl(context: CostEvidenceServiceContext, evidenceFileId: string, value: unknown) { requirePermission(context, 'cost.read'); requirePermission(context, 'cost.file.read'); return this.repository.createReadUrl(context, evidenceFileId, parse(costEvidenceReadUrlInputSchema, value)) }
}
