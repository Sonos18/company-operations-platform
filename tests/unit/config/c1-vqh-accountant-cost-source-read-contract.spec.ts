import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationName = /_c1_vqh_accountant_cost_source_read\.sql$/u

function migrationSql() {
  const names = readdirSync(resolve(root, 'supabase/migrations')).filter(name => migrationName.test(name))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(root, 'supabase/migrations', names[0]!), 'utf8')
}

describe('C1 VQH accountant cost-source-read contract', () => {
  it('fails closed while adding only cost.source.read to the canonical accountant role', () => {
    const sql = migrationSql()
    for (const value of ['10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000307', 'accountant', 'c1_vqh_cost_operator', 'cost.source.read', 'C1_ACCOUNTANT_SOURCE_READ_PRESTATE_DRIFT', 'C1_ACCOUNTANT_SOURCE_READ_POSTSTATE_FAILED']) expect(sql).toContain(value)
    expect(sql).toMatch(/insert into public\.role_permissions[\s\S]*?'cost\.source\.read'/iu)
    expect(sql).toMatch(/cost\.correct[\s\S]*?cost\.manage/iu)
    expect(sql).not.toMatch(/\b(?:insert|update|delete)\s+(?:into\s+)?public\.(?:roles|permissions|company_role_assignments|company_memberships|tenant_memberships|employees|projects|project_cost_items|project_cost_item_sources|accounting_sources|source_reported_figures)/iu)
  })
})
