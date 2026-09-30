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
    expect(direct.safeParse({ categoryId: ids.category, description: 'Install trim', amount: '1.0000', sourceFigureIds: [] }).success).toBe(true)
    expect(direct.safeParse({ categoryId: ids.category, description: 'Install trim', amount: '1.0000', sourceFigureIds: null }).success).toBe(false)
    expect(direct.safeParse({ categoryId: ids.category, description: 'Install trim', amount: '1.0000', sourceFigureIds: 'not-an-array' }).success).toBe(false)
    expect(direct.safeParse({ projectId: ids.project, categoryId: ids.category, description: 'Install trim', amount: '1.0000' }).success).toBe(false)
  })

  it('keeps publish input to its required version field only', () => {
    const publish = schema('publishProjectCostDetailInputSchema')
    expect(publish).toBeDefined()
    expect(publish.safeParse({ expectedVersion: 0 }).success).toBe(true)
    expect(publish.safeParse({ expectedVersion: null }).success).toBe(false)
    expect(publish.safeParse({ expectedVersion: 0, unexpected: true }).success).toBe(false)
  })

  it('validates correction retention replacement and amount consistency', () => {
    const correct = schema('correctPublishedProjectCostDetailInputSchema')
    const base = { expectedVersion: 0, reason: 'Correct retention', changes: { amount: '10.0000', retentionKind: 'warranty', retentionRateBps: 500, retentionAmount: '1.0000' } }
    expect(correct.safeParse(base).success).toBe(true)
    expect(correct.safeParse({ ...base, changes: { ...base.changes, retentionAmount: '10.0001' } }).success).toBe(false)
    expect(correct.safeParse({ ...base, changes: { ...base.changes, retentionKind: null } }).success).toBe(false)
  })

  it('accepts a complete retention clear and rejects incomplete kind clears', () => {
    const correct = schema('correctPublishedProjectCostDetailInputSchema')
    const input = (changes: Record<string, unknown>) => ({ expectedVersion: 1, reason: 'Remove retention', changes })

    expect(correct.safeParse(input({ retentionKind: null, retentionRateBps: null, retentionAmount: null })).success).toBe(true)
    expect(correct.safeParse(input({ retentionKind: null })).success).toBe(false)
    expect(correct.safeParse(input({ retentionKind: null, retentionRateBps: null })).success).toBe(false)
    expect(correct.safeParse(input({ retentionKind: null, retentionAmount: null })).success).toBe(false)
  })

  it('delegates valid partial retention updates to effective-state database validation', () => {
    const correct = schema('correctPublishedProjectCostDetailInputSchema')
    const input = (changes: Record<string, unknown>) => ({ expectedVersion: 1, reason: 'Adjust retention', changes })

    for (const changes of [
      { retentionRateBps: 750 },
      { retentionRateBps: null },
      { retentionKind: 'other' },
      { retentionAmount: '2.0000' },
      { retentionAmount: null },
      { amount: '0.5000' },
    ]) expect(correct.safeParse(input(changes)).success).toBe(true)

    expect(correct.safeParse(input({ retentionKind: 'warranty', retentionAmount: null })).success).toBe(false)
  })

  it('preserves omitted versus explicit-null semantics for every nullable correction field', () => {
    const correct = schema('correctPublishedProjectCostDetailInputSchema')
    const input = (changes: Record<string, unknown>) => ({ expectedVersion: 1, reason: 'Clear field', changes })

    for (const field of ['relevantDate', 'reference', 'note', 'quantity', 'unitCode', 'unitPrice']) {
      expect(correct.safeParse(input({ [field]: null })).success).toBe(true)
    }
    expect(correct.safeParse(input({ sourceFigureIds: [] })).success).toBe(true)
    expect(correct.safeParse(input({ sourceFigureIds: [ids.source] })).success).toBe(true)
    expect(correct.safeParse(input({ sourceFigureIds: [ids.source, ids.source] })).success).toBe(false)
    expect(correct.safeParse(input({ sourceFigureIds: null })).success).toBe(false)
    expect(correct.safeParse(input({})).success).toBe(false)
    expect(correct.safeParse(input({ unexpected: null })).success).toBe(false)
  })

  it('rejects own undefined correction fields that JSON transport would erase', () => {
    const correct = schema('correctPublishedProjectCostDetailInputSchema')
    const fields = [
      'description', 'relevantDate', 'reference', 'note', 'quantity', 'unitCode', 'unitPrice',
      'amount', 'retentionKind', 'retentionRateBps', 'retentionAmount', 'sourceFigureIds',
    ]

    for (const field of fields) {
      expect(correct.safeParse({ expectedVersion: 1, reason: 'Invalid undefined patch', changes: { [field]: undefined } }).success).toBe(false)
    }
  })
})
