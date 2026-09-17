import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationName = /_c1_vqh_project_cost_rbac_hardening\.sql$/u

function migrationSql() {
  const names = readdirSync(resolve(root, 'supabase/migrations')).filter(name => migrationName.test(name))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(root, 'supabase/migrations', names[0]!), 'utf8')
}

describe('C1 VQH Project Cost RBAC hardening contract', () => {
  it('fails closed before narrowing only the two approved VQH roles', () => {
    const sql = migrationSql()

    expect(sql).toContain("'10000000-0000-4000-8000-000000000010'::uuid")
    expect(sql).toContain("'10000000-0000-4000-8000-000000000020'::uuid")
    expect(sql).toContain("'10000000-0000-4000-8000-000000000307'::uuid")
    expect(sql).toContain("C1_ACCOUNTANT_PERMISSION_SCOPE_DRIFT")
    expect(sql).toContain("C1_COST_OPERATOR_PERMISSION_SCOPE_DRIFT")
    expect(sql).toContain("'cost.read'")
    expect(sql).toContain("'cost.manage'")
    expect(sql).toContain("'cost.correct'")
    expect(sql).toMatch(/delete from public\.role_permissions/iu)
    expect(sql).not.toMatch(/\b(?:insert|update|delete)\s+public\.(?:roles|permissions|company_role_assignments|company_memberships|tenant_memberships|employees|project_cost_items|project_cost_item_sources|cost_command_receipts|audit_events|projects|source_reported_figures)/iu)
  })
})
