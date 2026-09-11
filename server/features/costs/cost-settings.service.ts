import type { PermissionCode } from '../../../shared/constants/permissions'
import { AppApiError } from '../../utils/api-error'
import type { CostSettingsDataRepository } from './cost-settings.repository'
export interface CostSettingsServiceContext { tenantId: string; companyId: string; permissions: readonly PermissionCode[] }
export function createCostSettingsService(repository: CostSettingsDataRepository) { return { async get(context: CostSettingsServiceContext) { if (!context.permissions.includes('cost.config.manage')) throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền quản lý cấu hình C1.'); const settings = await repository.get(context.companyId, context.tenantId); if (!settings) throw new AppApiError(404, 'OPPORTUNITY_NOT_FOUND', 'Không tìm thấy cấu hình C1.'); return settings } } }
