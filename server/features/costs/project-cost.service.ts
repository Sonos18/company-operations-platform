import type { PermissionCode } from '../../../shared/constants/permissions'
import { correctProjectCostItemInputSchema, createProjectCostDraftInputSchema, createProjectCostItemInputSchema, prepareProjectCostFinancialsInputSchema, publishProjectCostInputSchema, updateProjectCostDraftInputSchema, updateProjectCostItemInputSchema } from '../../../shared/schemas/costs/project-costs'
import { AppApiError } from '../../utils/api-error'
import type { ProjectCostDataRepository, ProjectCostRequestContext } from './project-cost.repository'

export interface ProjectCostServiceContext extends ProjectCostRequestContext { actorId: string; tenantId: string; permissions: readonly PermissionCode[] }

function requirePermission(context: ProjectCostServiceContext, permission: PermissionCode) { if (!context.permissions.includes(permission)) throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.') }
function input<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu không hợp lệ.'); return parsed.data }

export class ProjectCostService {
  constructor(private readonly repository: ProjectCostDataRepository) {}

  async listSummaries(context: ProjectCostServiceContext) { requirePermission(context, 'cost.read'); return this.repository.listSummaries(context.tenantId, context.companyId) }
  async projectSummary(context: ProjectCostServiceContext, projectId: string) { requirePermission(context, 'cost.read'); return this.repository.projectSummary(context.tenantId, context.companyId, projectId) }
  async createDraft(context: ProjectCostServiceContext, value: unknown, idempotencyKey: string) { requirePermission(context, 'cost.manage'); return this.repository.createDraft(context, input(createProjectCostDraftInputSchema, value), idempotencyKey) }
  async updateDraft(context: ProjectCostServiceContext, id: string, value: unknown) { requirePermission(context, 'cost.manage'); return this.repository.updateDraft(context, id, input(updateProjectCostDraftInputSchema, value)) }
  async prepareFinancials(context: ProjectCostServiceContext, id: string, value: unknown) { requirePermission(context, 'cost.prepare'); return this.repository.prepareFinancials(context, id, input(prepareProjectCostFinancialsInputSchema, value)) }
  async draft(context: ProjectCostServiceContext, id: string) { requirePermission(context, 'cost.prepare'); return this.repository.draft(context, id) }
  async listDrafts(context: ProjectCostServiceContext, projectId: string) { requirePermission(context, 'cost.prepare'); return this.repository.listDrafts(context, projectId) }
  async publish(context: ProjectCostServiceContext, id: string, value: unknown, idempotencyKey: string) { requirePermission(context, 'cost.publish_import'); const parsed = input(publishProjectCostInputSchema, value); return this.repository.publish(context, id, parsed.expectedVersion, idempotencyKey) }
  async create(context: ProjectCostServiceContext, value: unknown, idempotencyKey: string) { requirePermission(context, 'cost.manage'); return this.repository.create(context, input(createProjectCostItemInputSchema, value), idempotencyKey) }
  async update(context: ProjectCostServiceContext, id: string, value: unknown) { requirePermission(context, 'cost.manage'); return this.repository.update(context, id, { kind: 'update', input: input(updateProjectCostItemInputSchema, value) }) }
  async correct(context: ProjectCostServiceContext, id: string, value: unknown) { requirePermission(context, 'cost.correct'); return this.repository.update(context, id, { kind: 'correction', input: input(correctProjectCostItemInputSchema, value) }) }
  async itemDetails(context: ProjectCostServiceContext, projectCostItemId: string) { requirePermission(context, 'cost.read'); return this.repository.itemDetails(context.tenantId, context.companyId, projectCostItemId) }
}
