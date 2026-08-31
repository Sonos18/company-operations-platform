import { describe, expect, it } from 'vitest'
import {
  activeAssignments,
  latestCriterionRevision,
  openBlockers,
  orderedDecisionCycles,
  taxonomyLabel,
} from '../../../app/features/stage01-operational/stage01-operational'

const timestamp = '2026-09-01T00:00:00.000Z'

describe('Stage 01 operational display helpers', () => {
  it('maps a bound taxonomy code to its label and keeps meaningful fallbacks', () => {
    const entries = [{ code: 'high', label: 'Ưu tiên cao' }]

    expect(taxonomyLabel(entries, 'high')).toBe('Ưu tiên cao')
    expect(taxonomyLabel(entries, 'retired')).toBe('retired')
    expect(taxonomyLabel(entries, null)).toBe('Chưa xác định')
  })

  it('keeps only active assignments and open blockers from the canonical node runtime', () => {
    const assignments = [
      { id: 'active', endedAt: null },
      { id: 'ended', endedAt: timestamp },
    ]
    const blockers = [
      { id: 'open', resolvedAt: null },
      { id: 'resolved', resolvedAt: timestamp },
    ]

    expect(activeAssignments(assignments).map(item => item.id)).toEqual(['active'])
    expect(openBlockers(blockers).map(item => item.id)).toEqual(['open'])
  })

  it('selects the newest revision for a criterion without mutating server history', () => {
    const evaluations = [
      { id: 'r2', criterionKey: 'need-fit', revision: 2 },
      { id: 'other', criterionKey: 'scope-fit', revision: 7 },
      { id: 'r1', criterionKey: 'need-fit', revision: 1 },
    ]

    expect(latestCriterionRevision(evaluations, 'need-fit')).toEqual({ id: 'r2', criterionKey: 'need-fit', revision: 2 })
    expect(latestCriterionRevision(evaluations, 'missing')).toBeNull()
  })

  it('orders decision cycles by canonical cycle number without mutating the aggregate', () => {
    const cycles = [{ cycleNo: 2 }, { cycleNo: 1 }, { cycleNo: 3 }]

    expect(orderedDecisionCycles(cycles).map(cycle => cycle.cycleNo)).toEqual([1, 2, 3])
    expect(cycles.map(cycle => cycle.cycleNo)).toEqual([2, 1, 3])
  })
})
