import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')

function phaseMigration(suffix: string) {
  const names = readdirSync(resolve(root, 'supabase/migrations')).filter(name => name.endsWith(suffix))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(root, 'supabase/migrations', names[0]!), 'utf8')
}

describe('C1 accounting write target', () => {
  it('P1 adds publication state and exact VQH Accountant capabilities', () => {
    const sql = phaseMigration('_c1_accounting_write_publication_rbac.sql')

    expect(sql).toContain('publication_state')
    expect(sql).toContain("'legacy_backfill'")
    expect(sql).toContain("role.code = 'accountant'")
  })
})
