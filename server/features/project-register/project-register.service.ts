import type { PermissionCode } from '../../../shared/constants/permissions'
import type { CreateProjectRegisterInput, UpdateProjectRegisterInput } from '../../../shared/schemas/costs/master-data'
import { AppApiError } from '../../utils/api-error'
import type { ProjectRegisterDataRepository } from './project-register.repository'

export interface ProjectRegisterServiceContext { actorId: string; tenantId: string; companyId: string; permissions: readonly PermissionCode[]; requestId: string }
function requirePermission(context: ProjectRegisterServiceContext) { if (!context.permissions.includes('project.register.manage')) throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền quản lý Project Register.') }
function missing(): never { throw new AppApiError(404, 'OPPORTUNITY_NOT_FOUND', 'Không tìm thấy Project Register.') }
export function createProjectRegisterService(repository: ProjectRegisterDataRepository) { return {
  async list(context: ProjectRegisterServiceContext) { requirePermission(context); return repository.list(context.companyId, context.tenantId) },
  async get(context: ProjectRegisterServiceContext, id: string) { requirePermission(context); return await repository.get(context.companyId, context.tenantId, id) ?? missing() },
  async create(context: ProjectRegisterServiceContext, input: CreateProjectRegisterInput) { requirePermission(context); return repository.create(context.companyId, context.tenantId, input, context.requestId) },
  async update(context: ProjectRegisterServiceContext, id: string, input: UpdateProjectRegisterInput) { requirePermission(context); return repository.update(context.companyId, context.tenantId, id, input, context.requestId) },
} }
