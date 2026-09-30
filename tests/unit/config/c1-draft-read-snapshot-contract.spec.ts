import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function snapshotReadSql() {
  const directory = resolve(process.cwd(), 'supabase/migrations')
  const names = readdirSync(directory).filter(name => name.endsWith('_c1_draft_read_snapshot_fix.sql'))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(directory, names[0]!), 'utf8')
}

function detailCommandsSql() {
  return readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1/c1_ordinary_cost_detail_commands.test.sql'), 'utf8')
}

describe('C1 draft read snapshot migration', () => {
  it('reads a published parent scope without using the mutation lock helper', () => {
    const sql = snapshotReadSql()
    const read = sql.match(/create or replace function private\.c1_read_project_cost_detail_draft[\s\S]*?\n\$\$;/iu)?.[0] ?? ''

    expect(sql).toContain("set local lock_timeout = '5s';")
    expect(sql).toContain("set local statement_timeout = '90s';")
    expect(sql).toContain('select pg_catalog.pg_advisory_xact_lock(71842, 23);')
    expect(sql).toContain("message = 'C1_DRAFT_READ_SNAPSHOT_BASELINE_MISSING'")
    expect(read).toContain("item.publication_state='published'")
    expect(read).toContain("message='RESOURCE_NOT_FOUND'")
    expect(read).toContain("message='COST_DETAIL_NOT_DRAFT'")
    expect(read).not.toContain('private.c1_detail_load_readiness_scope')
    expect(read).not.toMatch(/for update/iu)
    expect(detailCommandsSql()).toContain("'draft reader remains STABLE'")
    expect(detailCommandsSql()).toContain("'draft reader does not take a row lock'")
  })
})
