import { z } from 'zod'
import { itemDetailQuerySchema, paymentQuerySchema, projectDirectoryQuerySchema, financeListQuerySchema, type FinanceBudget, type FinanceItemDetails, type FinanceOwnerAdvances, type FinanceOverview, type FinanceProjectList, type FinanceSubcontractDetail, type FinanceSubcontractorDetail, type FinanceSubcontractorList, type ItemDetailQuery, type PaymentQuery, type ProjectDirectoryQuery, type FinanceListQuery } from '../../../../shared/schemas/costs/project-finance'
import type { PermissionCode } from '../../../../shared/constants/permissions'
import { AppApiError } from '../../../utils/api-error'
import type { FinanceReadRepository, FinanceScope } from './project-finance.repository'

export type ProjectFinanceServiceContext = FinanceScope & { permissions: readonly PermissionCode[] }

function requirePermission(context: ProjectFinanceServiceContext) {
  if (!context.permissions.includes('cost.read')) throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền xem dữ liệu tài chính.')
}

function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
  return parsed.data
}

function id(value: unknown): string {
  const parsed = z.string().uuid().safeParse(value)
  if (!parsed.success) throw new AppApiError(400, 'INPUT_INVALID', 'Định danh không hợp lệ.')
  return parsed.data
}

export class ProjectFinanceService {
  constructor(private readonly repository: FinanceReadRepository) {}

  async listProjects(context: ProjectFinanceServiceContext, query: unknown): Promise<FinanceProjectList> {
    requirePermission(context)
    return this.repository.listProjects(context, input(projectDirectoryQuerySchema, query))
  }

  async overview(context: ProjectFinanceServiceContext, projectId: unknown): Promise<FinanceOverview> {
    requirePermission(context)
    return this.repository.overview(context, id(projectId))
  }

  async budget(context: ProjectFinanceServiceContext, projectId: unknown): Promise<FinanceBudget> {
    requirePermission(context)
    return this.repository.budget(context, id(projectId))
  }

  async ownerAdvances(context: ProjectFinanceServiceContext, projectId: unknown, query: unknown): Promise<FinanceOwnerAdvances> {
    requirePermission(context)
    return this.repository.ownerAdvances(context, id(projectId), input(financeListQuerySchema, query))
  }

  async subcontractors(context: ProjectFinanceServiceContext, projectId: unknown): Promise<FinanceSubcontractorList> {
    requirePermission(context)
    return this.repository.subcontractors(context, id(projectId))
  }

  async subcontractor(context: ProjectFinanceServiceContext, projectId: unknown, partyId: unknown, query: unknown): Promise<FinanceSubcontractorDetail> {
    requirePermission(context)
    return this.repository.subcontractor(context, id(projectId), id(partyId), input(paymentQuerySchema, query))
  }

  async subcontract(context: ProjectFinanceServiceContext, projectId: unknown, subcontractId: unknown, query: unknown): Promise<FinanceSubcontractDetail> {
    requirePermission(context)
    return this.repository.subcontract(context, id(projectId), id(subcontractId), input(paymentQuerySchema, query))
  }

  async itemDetails(context: ProjectFinanceServiceContext, projectId: unknown, itemId: unknown, query: unknown): Promise<FinanceItemDetails> {
    requirePermission(context)
    return this.repository.itemDetails(context, id(projectId), id(itemId), input(itemDetailQuerySchema, query))
  }
}

export type { FinanceScope, ProjectDirectoryQuery, FinanceListQuery, PaymentQuery, ItemDetailQuery }
