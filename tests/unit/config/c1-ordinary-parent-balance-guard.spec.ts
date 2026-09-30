import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrations = resolve(root, 'supabase/migrations')
const testSql = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_ordinary_cost_detail_commands.test.sql'), 'utf8')

function guardSql() {
  const names = readdirSync(migrations).filter(name => name.endsWith('_c1_ordinary_parent_balance_guard.sql'))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(migrations, names[0]!), 'utf8')
}

describe('C1 ordinary parent balance guard', () => {
  it('fails closed when a published parent does not equal its published-detail aggregate', () => {
    const sql = guardSql()

    expect(sql).toContain("set local lock_timeout = '5s';")
    expect(sql).toContain("set local statement_timeout = '90s';")
    expect(sql).toContain('pg_advisory_xact_lock(71842, 25)')
    expect(sql).toContain('C1_ORDINARY_PARENT_BALANCE_GUARD_BASELINE_MISSING')
    expect(sql).toMatch(/create or replace function private\.c1_resolve_or_create_ordinary_project_cost_item/iu)
    expect(sql).toMatch(/for update;[\s\S]*coalesce\(sum\(detail\.amount_text::numeric\),\s*0\)/iu)
    expect(sql).toMatch(/COST_DETAIL_PUBLISH_NOT_READY[\s\S]*FINANCIAL_DETAILS_REQUIRED/iu)
  })

  it('keeps the pgTAP regression on both command paths and both reusable controls', () => {
    const balanceTestSql = testSql.slice(testSql.indexOf('c1d_legacy_parent_balance_before'))

    expect(testSql).toContain('legacy parent balance draft')
    expect(testSql).toContain('legacy parent balance direct')
    expect(testSql).toContain('legacy nonzero parent is rejected before detail creation')
    expect(testSql).toContain('zero-valued published empty shell remains reusable')
    expect(testSql).toContain('coherent nonzero published parent remains reusable')
    expect(balanceTestSql).toContain(`"sub":"c1d10000-0000-4000-8000-000000000901","role":"authenticated"`)
  })
})
