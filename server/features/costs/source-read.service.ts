import { z } from 'zod'
import type { PermissionCode } from '../../../shared/constants/permissions'
import { costSourceFiguresQuerySchema, costSourceOverviewSchema, costSourceProjectDetailSchema, costSourceProvenanceSchema, type CostSourceFiguresQuery } from '../../../shared/schemas/costs/source-read-model'
import { AppApiError } from '../../utils/api-error'
import type { CostSourceReadRepository } from './source-read.repository'

export interface CostSourceReadContext { companyId: string; tenantId: string; permissions: readonly PermissionCode[] }
const uuid = z.string().uuid()
const empty = { cursor: undefined, limit: 100 }
function latest(values: readonly string[]) { return values.length ? values.reduce((value, item) => item > value ? item : value) : null }
function requireCapabilities(context: CostSourceReadContext) {
  if (!context.permissions.includes('cost.source.read') || !context.permissions.includes('cost.prepare')) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền xem dữ liệu nguồn chi phí.')
  }
}
export function createCostSourceReadService(repository: CostSourceReadRepository) {
  async function checked<T>(context: CostSourceReadContext, action: () => Promise<T>) { requireCapabilities(context); await repository.probe(context.companyId); return action() }
  return {
    overview(context: CostSourceReadContext) {
      return checked(context, async () => {
        const records = await repository.figures(context.companyId, context.tenantId, empty)
        const groups = new Map<string, { project: NonNullable<(typeof records)[number]['hierarchy']['project']>; records: typeof records }>()
        const unassigned = records.filter(record => !record.figure.mapping.projectId)
        for (const record of records) if (record.figure.mapping.projectId && record.hierarchy.project?.id === record.figure.mapping.projectId) {
          const current = groups.get(record.figure.mapping.projectId) ?? { project: record.hierarchy.project, records: [] }
          current.records.push(record); groups.set(record.figure.mapping.projectId, current)
        }
        const openIssues = new Set(records.flatMap(record => record.openIssues.map(issue => `${issue.issueKind}:${issue.description}`)))
        return costSourceOverviewSchema.parse({ projects: [...groups.values()].map(group => ({ project: group.project, engagements: [], sourceCount: new Set(group.records.map(record => record.figure.source.id)).size, figureCount: group.records.length, latestObservedAt: latest(group.records.map(record => record.figure.observedAt)), openIssueCount: new Set(group.records.flatMap(record => record.openIssues.map(issue => `${issue.issueKind}:${issue.description}`))).size, mappingState: group.records.some(record => record.figure.mapping.state === 'pending') ? 'pending' : group.records[0]!.figure.mapping.state })), unassigned: { sourceCount: new Set(unassigned.map(record => record.figure.source.id)).size, figureCount: unassigned.length, latestObservedAt: latest(unassigned.map(record => record.figure.observedAt)) }, sourceCount: new Set(records.map(record => record.figure.source.id)).size, figureCount: records.length, openIssueCount: openIssues.size })
      })
    },
    project(context: CostSourceReadContext, projectId: string) {
      return checked(context, async () => {
        const id = uuid.safeParse(projectId); if (!id.success) throw new AppApiError(400, 'INPUT_INVALID', 'Định danh dự án không hợp lệ.')
        const records = await repository.figures(context.companyId, context.tenantId, { ...empty, projectId: id.data })
        const project = records.find(record => record.figure.mapping.projectId === id.data && record.hierarchy.project?.id === id.data)?.hierarchy.project ?? null
        const engagements = new Map<string, typeof records>()
        for (const record of records) if (record.figure.mapping.engagementId && record.hierarchy.engagement?.id === record.figure.mapping.engagementId) engagements.set(record.figure.mapping.engagementId, [...(engagements.get(record.figure.mapping.engagementId) ?? []), record])
        return costSourceProjectDetailSchema.parse({ project, engagements: [...engagements.entries()].map(([, items]) => ({ engagement: items[0]!.hierarchy.engagement, contractor: items[0]!.hierarchy.contractor, figureCount: items.length, latestObservedAt: latest(items.map(item => item.figure.observedAt)) })) })
      })
    },
    figures(context: CostSourceReadContext, input: unknown) {
      return checked(context, async () => {
        const parsed = costSourceFiguresQuerySchema.safeParse(input)
        if (!parsed.success) throw new AppApiError(400, 'INPUT_INVALID', 'Bộ lọc dữ liệu nguồn không hợp lệ.')
        const query = parsed.data as CostSourceFiguresQuery
        const records = await repository.figures(context.companyId, context.tenantId, query)
        const items = records.map(record => record.figure)
        return { items, nextCursor: items.length === query.limit ? items.at(-1)?.id ?? null : null }
      })
    },
    provenance(context: CostSourceReadContext, figureId: string) {
      return checked(context, async () => {
        const id = uuid.safeParse(figureId); if (!id.success) throw new AppApiError(400, 'INPUT_INVALID', 'Định danh số liệu không hợp lệ.')
        const value = await repository.provenance(context.companyId, context.tenantId, id.data)
        if (!value) throw new AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy số liệu nguồn.')
        return costSourceProvenanceSchema.parse(value)
      })
    },
  }
}
