import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve('supabase/migrations/20261001081932_c1_parent_draft_retirement.sql'), 'utf8').toLowerCase()
const publicNames = [
  'c1_create_project_cost_draft', 'c1_update_project_cost_draft',
  'c1_prepare_project_cost_financials', 'c1_read_project_cost_draft',
  'c1_list_project_cost_drafts', 'c1_read_project_cost_draft_operational',
  'c1_list_project_cost_drafts_operational', 'c1_publish_project_cost',
  'c1_create_project_cost_item', 'c1_update_project_cost_item',
]
const privateNames = [
  ...publicNames.slice(0, 8),
  'c1_project_cost_draft_json', 'c1_project_cost_draft_operational_json',
  'c1_project_cost_publish_readiness',
]

describe('C1 parent draft retirement migration', () => {
  it('drops exactly the intended public and private functions without cascading or deleting data', () => {
    const drops = [...sql.matchAll(/^drop function (public|private)\.(\w+)\([^;]+?\) restrict;/gm)]
    expect(drops.map(([, schema, name]) => `${schema}.${name}`).sort()).toEqual([
      ...publicNames.map(name => `public.${name}`),
      ...privateNames.map(name => `private.${name}`),
    ].sort())
    expect(sql).not.toMatch(/^\s*(drop table|truncate|delete from)\b|^drop function [^;]+ cascade;/m)
  })

  it('locks parent writes before rejecting surviving drafts and checks published sums', () => {
    expect(sql.indexOf('lock table public.project_cost_items in share row exclusive mode')).toBeLessThan(sql.indexOf("publication_state = 'draft'"))
    expect(sql).toContain('item.amount_text::numeric is distinct from totals.amount')
    expect(sql).toContain('c1_retire_unexpected_overload')
    expect(sql).toContain('c1_retire_unexpected_catalog_dependency')
    expect(sql).toContain('c1_retire_unexpected_body_caller')
    expect(sql).toContain('c1_retire_required_survivor_missing')
  })

  it('has no retired RPC calls in executable C1 acceptance fixtures', () => {
    const fixtures = readdirSync(resolve('supabase/tests/database/c1'), { recursive: true })
      .filter(path => String(path).endsWith('.sql'))
      .map(path => resolve('supabase/tests/database/c1', String(path)))
    const concurrency = readdirSync(resolve('supabase/tests/database/c1_ordinary_detail_concurrency'), { recursive: true })
      .filter(path => String(path).endsWith('.sql'))
      .map(path => resolve('supabase/tests/database/c1_ordinary_detail_concurrency', String(path)))
    const call = new RegExp(`\\b(?:select|perform|call)\\s+(?:public\\.(?:${publicNames.join('|')})|private\\.(?:${privateNames.join('|')}))\\s*\\(`, 'iu')
    for (const path of [...fixtures, ...concurrency]) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(call)
    }
    const runner = readFileSync(resolve('scripts/run-c1-ordinary-detail-concurrency.mjs'), 'utf8')
    expect(runner).not.toMatch(/legacy-create|legacy-recateg|c1_create_project_cost_draft|c1_update_project_cost_draft/iu)
  })
})
