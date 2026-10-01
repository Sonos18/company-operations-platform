import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(resolve(root, 'supabase/migrations/20260924093428_c1_ordinary_cost_detail_lifecycle_foundation.sql'), 'utf8')
const liveFixture = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_ordinary_cost_detail_lifecycle_foundation.test.sql'), 'utf8')

type Detail = {
  id: string
  created_at: string
  publication_state: string | null
  publication_origin: string | null
  published_by: string | null
  published_at: string | null
  publication_request_id: string | null
}

function backfillAssignments() {
  const statement = migration.match(/\bupdate public\.project_cost_item_details\s+set\s+([^;]+);/iu)?.[1]
  expect(statement).toBeDefined()
  expect(statement).not.toMatch(/\bwhere\b/iu)
  const assignments = statement!.split(',').map(part => {
    const match = part.trim().match(/^(\w+)\s*=\s*(null|'[^']*'|created_at)$/iu)
    expect(match).not.toBeNull()
    return [match![1]!, match![2]!] as const
  })
  expect(assignments).toEqual([
    ['publication_state', "'published'"],
    ['publication_origin', "'legacy_backfill'"],
    ['published_by', 'null'],
    ['published_at', 'created_at'],
    ['publication_request_id', 'null'],
  ])
  return assignments
}

function violations(rows: Detail[], historicalIds: Set<string>) {
  return rows.filter(row => historicalIds.has(row.id) && (
    row.publication_state !== 'published'
    || row.publication_origin !== 'legacy_backfill'
    || row.published_by !== null
    || row.published_at !== row.created_at
    || row.publication_request_id !== null
  )).map(row => row.id)
}

describe('C1 ordinary detail legacy backfill contract', () => {
  it('backfills every independently identified pre-migration fixture and catches wrong labels', () => {
    const assignments = backfillAssignments()
    const legacyA = 'c1fa0000-0000-4000-8000-000000000401'
    const legacyB = 'c1fa0000-0000-4000-8000-000000000402'
    const historical: Detail[] = [
      { id: legacyA, created_at: '2026-09-18T08:00:00Z', publication_state: null, publication_origin: null, published_by: null, published_at: null, publication_request_id: null },
      { id: legacyB, created_at: '2026-09-18T09:00:00Z', publication_state: null, publication_origin: null, published_by: null, published_at: null, publication_request_id: null },
    ]
    const historicalIds = new Set(historical.map(row => row.id))
    const backfilled = historical.map(row => ({
      ...row,
      ...Object.fromEntries(assignments.map(([column, value]) => [
        column,
        value === 'created_at' ? row.created_at : value === 'null' ? null : value.slice(1, -1),
      ])),
    })) as Detail[]
    const laterDraft: Detail = { id: 'c1fa0000-0000-4000-8000-000000000403', created_at: '2026-10-01T04:00:00Z', publication_state: 'draft', publication_origin: null, published_by: null, published_at: null, publication_request_id: null }

    expect(violations([...backfilled, laterDraft], historicalIds)).toEqual([])
    const wronglyCommandPublished: Detail = {
      ...backfilled[0]!,
      publication_origin: 'command',
      published_by: 'c1fa0000-0000-4000-8000-000000000901',
      published_at: '2026-10-01T04:00:00Z',
      publication_request_id: 'c1fa0000-0000-4000-8000-000000000601',
    }
    const wronglyDraft: Detail = {
      ...backfilled[1]!,
      publication_state: 'draft',
      publication_origin: null,
      published_at: null,
    }
    expect(violations([wronglyCommandPublished, backfilled[1]!, laterDraft], historicalIds)).toEqual([legacyA])
    expect(violations([backfilled[0]!, wronglyDraft, laterDraft], historicalIds)).toEqual([legacyB])
  })

  it('describes the live check as metadata-only and retains draft protections', () => {
    expect(liveFixture).toContain('already-labelled legacy details retain published metadata without fabricated attribution')
    expect(liveFixture).toContain('operational draft detail retains unpublished metadata')
    expect(liveFixture).toContain('draft insert and update have zero published-parent effect')
  })
})
