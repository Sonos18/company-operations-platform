import type { AuthenticatedHttpClient } from './authenticated-http-client'
import { financeBudgetSchema, financeItemDetailsSchema, financeListQuerySchema, financeOwnerAdvancesSchema, financeOverviewSchema, financeProjectListSchema, financeSubcontractDetailSchema, financeSubcontractorDetailSchema, financeSubcontractorListSchema, itemDetailQuerySchema, paymentQuerySchema, projectDirectoryQuerySchema, type FinanceListQuery, type ItemDetailQuery, type PaymentQuery, type ProjectDirectoryQuery } from '../../../shared/schemas/costs/project-finance'
import type { FinanceBudget, FinanceItemDetails, FinanceOwnerAdvances, FinanceOverview, FinanceProjectList, FinanceSubcontractDetail, FinanceSubcontractorDetail, FinanceSubcontractorList, ProjectFinanceRepository } from '../contracts'

function activeCompany(value: string | (() => string)): string {
  const companyId = typeof value === 'function' ? value() : value
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(companyId)) throw new Error('ACTIVE_COMPANY_REQUIRED')
  return encodeURIComponent(companyId)
}

function search<T extends Record<string, unknown>>(schema: { parse(value: unknown): T }, value: Partial<T> | undefined): string {
  const parsed = schema.parse(value ?? {})
  const params = new URLSearchParams()
  for (const [key, item] of Object.entries(parsed)) if (item !== undefined) params.set(key, String(item))
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

export function createHttpProjectFinanceRepository(options: { companyId: string | (() => string), client: AuthenticatedHttpClient }): ProjectFinanceRepository {
  const base = () => `/api/companies/${activeCompany(options.companyId)}`
  const id = (value: string) => encodeURIComponent(value)
  return {
    listProjects: (query?: Partial<ProjectDirectoryQuery>): Promise<FinanceProjectList> => options.client.request({ url: `${base()}/project-finances${search(projectDirectoryQuerySchema, query)}`, method: 'GET', schema: financeProjectListSchema }),
    overview: (projectId: string): Promise<FinanceOverview> => options.client.request({ url: `${base()}/projects/${id(projectId)}/finance`, method: 'GET', schema: financeOverviewSchema }),
    budget: (projectId: string): Promise<FinanceBudget> => options.client.request({ url: `${base()}/projects/${id(projectId)}/finance/budget`, method: 'GET', schema: financeBudgetSchema }),
    ownerAdvances: (projectId: string, query?: Partial<FinanceListQuery>): Promise<FinanceOwnerAdvances> => options.client.request({ url: `${base()}/projects/${id(projectId)}/finance/owner-advances${search(financeListQuerySchema, query)}`, method: 'GET', schema: financeOwnerAdvancesSchema }),
    subcontractors: (projectId: string): Promise<FinanceSubcontractorList> => options.client.request({ url: `${base()}/projects/${id(projectId)}/finance/subcontractors`, method: 'GET', schema: financeSubcontractorListSchema }),
    subcontractor: (projectId: string, partyId: string, query?: Partial<PaymentQuery>): Promise<FinanceSubcontractorDetail> => options.client.request({ url: `${base()}/projects/${id(projectId)}/finance/subcontractors/${id(partyId)}${search(paymentQuerySchema, query)}`, method: 'GET', schema: financeSubcontractorDetailSchema }),
    subcontract: (projectId: string, subcontractId: string, query?: Partial<PaymentQuery>): Promise<FinanceSubcontractDetail> => options.client.request({ url: `${base()}/projects/${id(projectId)}/finance/subcontracts/${id(subcontractId)}${search(paymentQuerySchema, query)}`, method: 'GET', schema: financeSubcontractDetailSchema }),
    itemDetails: (projectId: string, itemId: string, query?: Partial<ItemDetailQuery>): Promise<FinanceItemDetails> => options.client.request({ url: `${base()}/projects/${id(projectId)}/finance/items/${id(itemId)}/details${search(itemDetailQuerySchema, query)}`, method: 'GET', schema: financeItemDetailsSchema }),
  }
}
