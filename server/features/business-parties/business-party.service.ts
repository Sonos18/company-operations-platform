import type { PermissionCode } from '../../../shared/constants/permissions'
import type { CreateBusinessPartyInput, UpdateBusinessPartyInput } from '../../../shared/schemas/costs/master-data'
import { AppApiError } from '../../utils/api-error'
import type { BusinessPartyDataRepository } from './business-party.repository'
export interface BusinessPartyServiceContext { actorId: string; tenantId: string; companyId: string; permissions: readonly PermissionCode[]; requestId: string }
function check(context: BusinessPartyServiceContext) { if (!context.permissions.includes('party.manage')) throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền quản lý Business Party.') }
function missing(): never { throw new AppApiError(404, 'OPPORTUNITY_NOT_FOUND', 'Không tìm thấy Business Party.') }
export function createBusinessPartyService(repository: BusinessPartyDataRepository) { return { async list(context: BusinessPartyServiceContext) { check(context); return repository.list(context.companyId, context.tenantId) }, async get(context: BusinessPartyServiceContext, id: string) { check(context); return await repository.get(context.companyId, context.tenantId, id) ?? missing() }, async create(context: BusinessPartyServiceContext, input: CreateBusinessPartyInput) { check(context); return repository.create(context.companyId, context.tenantId, input, context.requestId) }, async update(context: BusinessPartyServiceContext, id: string, input: UpdateBusinessPartyInput) { check(context); return repository.update(context.companyId, context.tenantId, id, input, context.requestId) } } }
