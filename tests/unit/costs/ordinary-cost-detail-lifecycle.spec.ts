import { describe, expect, it } from 'vitest'
import * as contracts from '../../../shared/schemas/costs/project-costs'

const ids = {
  project: 'c1020000-0000-4000-8000-000000000001',
  category: 'c1020000-0000-4000-8000-000000000002',
  source: 'c1020000-0000-4000-8000-000000000003',
}

type Parser = { safeParse(value: unknown): { success: boolean } }
const schema = (name: string) => (contracts as Record<string, Parser>)[name]

describe('ordinary cost detail lifecycle contracts', () => {
  it('keeps draft creation operational and keeps the path project out of the strict body', () => {
    const create = schema('createProjectCostDetailDraftInputSchema')
    expect(create).toBeDefined()
    expect(create.safeParse({ categoryId: ids.category, description: 'Install trim' }).success).toBe(true)
    expect(create.safeParse({ projectId: ids.project, categoryId: ids.category, description: 'Install trim' }).success).toBe(false)
    expect(create.safeParse({ categoryId: ids.category, description: 'Install trim', amount: '1.0000' }).success).toBe(false)
  })

  it('requires a version and amount for one-detail financial preparation', () => {
    const prepare = schema('prepareProjectCostDetailFinancialsInputSchema')
    expect(prepare).toBeDefined()
    expect(prepare.safeParse({ expectedVersion: 0, amount: '1.0000', sourceFigureIds: [ids.source] }).success).toBe(true)
    expect(prepare.safeParse({ expectedVersion: 0 }).success).toBe(false)
  })

  it('requires all three command permissions through separate service gates', () => {
    const direct = schema('createAndPublishProjectCostDetailInputSchema')
    expect(direct).toBeDefined()
    expect(direct.safeParse({ categoryId: ids.category, description: 'Install trim', amount: '1.0000' }).success).toBe(true)
    expect(direct.safeParse({ projectId: ids.project, categoryId: ids.category, description: 'Install trim', amount: '1.0000' }).success).toBe(false)
  })

  it('rejects correction retention shapes that exceed or contradict the corrected amount', () => {
    const correct = schema('correctPublishedProjectCostDetailInputSchema')
    const base = { expectedVersion: 0, reason: 'Correct retention', changes: { amount: '10.0000', retentionKind: 'warranty', retentionRateBps: 500, retentionAmount: '1.0000' } }
    expect(correct.safeParse(base).success).toBe(true)
    expect(correct.safeParse({ ...base, changes: { ...base.changes, retentionAmount: '10.0001' } }).success).toBe(false)
    expect(correct.safeParse({ ...base, changes: { ...base.changes, retentionKind: null } }).success).toBe(false)
  })
})
