import { costSourceFigurePageSchema, costSourceOverviewSchema, costSourceProjectDetailSchema, costSourceProvenanceSchema, costSourceFiguresQuerySchema, type CostSourceFiguresQuery, type CostSourceOverview, type CostSourceProjectDetail, type CostSourceProvenance } from '../../../shared/schemas/costs/source-read-model'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export interface HttpCostSourceReadRepository { overview(): Promise<CostSourceOverview>; project(projectId: string): Promise<CostSourceProjectDetail>; figures(projectId: string, query?: Partial<CostSourceFiguresQuery>): Promise<{ items: Awaited<ReturnType<HttpCostSourceReadRepository['provenance']>>['figure'][]; nextCursor: string | null }>; provenance(figureId: string): Promise<CostSourceProvenance> }
export function createHttpCostSourceReadRepository(options: { companyId: string | (() => string); client: AuthenticatedHttpClient }): HttpCostSourceReadRepository {
  const base = () => `/api/companies/${encodeURIComponent(typeof options.companyId === 'function' ? options.companyId() : options.companyId)}/cost-sources`
  const id = (value: string) => encodeURIComponent(value)
  const query = (value: Partial<CostSourceFiguresQuery> = {}) => {
    const parsed = costSourceFiguresQuerySchema.parse(value)
    const search = new URLSearchParams()
    for (const [key, item] of Object.entries(parsed)) if (item !== undefined) search.set(key, String(item))
    const valueText = search.toString()
    return valueText ? `?${valueText}` : ''
  }
  return {
    overview: () => options.client.request({ url: base(), method: 'GET', schema: costSourceOverviewSchema }),
    project: projectId => options.client.request({ url: `${base()}/projects/${id(projectId)}`, method: 'GET', schema: costSourceProjectDetailSchema }),
    figures: (projectId, filters) => options.client.request({ url: `${base()}/projects/${id(projectId)}/figures${query(filters)}`, method: 'GET', schema: costSourceFigurePageSchema }),
    provenance: figureId => options.client.request({ url: `${base()}/figures/${id(figureId)}`, method: 'GET', schema: costSourceProvenanceSchema }),
  }
}
