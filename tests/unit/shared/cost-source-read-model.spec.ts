import { describe, expect, it } from 'vitest'
import { costSourceFigureSchema, costSourceOverviewSchema, costSourceProjectDetailSchema } from '../../../shared/schemas/costs/source-read-model'

const timestamp = '2026-09-14T16:04:25.685407+00:00'
const item = { id: 'c1000000-0000-4000-8000-000000000001', code: 'EO-GIO', name: 'EO GIÓ' }

describe('cost source read timestamps', () => {
  it('accepts a PostgREST timestamptz offset for every exposed source-read timestamp', () => {
    expect(costSourceFigureSchema.safeParse({
      id: 'c1000000-0000-4000-8000-000000000002', label: 'Source value', rawValueText: '17186204', valueState: 'known', amountText: '17186204', currencyCode: null,
      basis: 'unknown', scopeKind: 'unknown', scopeDescription: 'Source-only', confirmation: 'unverified', observedAt: timestamp,
      mapping: { state: 'pending', projectId: null, engagementId: null, contractorId: null }, source: { id: 'c1000000-0000-4000-8000-000000000003', code: 'C1-EO-GIO-COST', title: 'EO GIÓ cost workbook', sourceSystem: 'xlsx' }, version: { id: 'c1000000-0000-4000-8000-000000000004', versionNo: 1 }, locator: { kind: 'cell_range', sheetName: 'Sheet', range: 'A1:A1' },
    }).success).toBe(true)
    expect(costSourceOverviewSchema.safeParse({ projects: [{ project: item, engagements: [], sourceCount: 2, figureCount: 43, latestObservedAt: timestamp, openIssueCount: 22, mappingState: 'pending' }], unassigned: { sourceCount: 0, figureCount: 0, latestObservedAt: timestamp }, sourceCount: 2, figureCount: 43, openIssueCount: 22 }).success).toBe(true)
    expect(costSourceProjectDetailSchema.safeParse({ project: item, engagements: [{ engagement: { id: 'c1000000-0000-4000-8000-000000000005', code: 'EO-GIO-YONG-MEI', name: 'Yong Mei' }, contractor: { id: 'c1000000-0000-4000-8000-000000000006', code: 'YONG-MEI', displayName: 'Yong Mei' }, figureCount: 11, latestObservedAt: timestamp }] }).success).toBe(true)
  })
})
