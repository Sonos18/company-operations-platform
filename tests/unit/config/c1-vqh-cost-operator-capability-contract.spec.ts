import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationName = /_c1_vqh_cost_operator_cost_correct\.sql$/u

function migrationSql() {
  const names = readdirSync(resolve(root, 'supabase/migrations')).filter(name => migrationName.test(name))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(root, 'supabase/migrations', names[0]!), 'utf8')
}

describe('C1 VQH cost-operator correction capability contract', () => {
  it('adds only cost.correct to the dedicated one-actor role', () => {
    const sql = migrationSql()

    expect(sql).toContain("role.code = 'c1_vqh_cost_operator'")
    expect(sql).toContain("permission.code = 'cost.correct'")
    expect(sql).toContain('insert into public.role_permissions')
    expect(sql).toContain('v_active_actor_count <> 1')
    expect(sql).not.toMatch(/insert into public\.(?:roles|permissions|company_role_assignments|company_memberships|tenant_memberships|projects|business_parties|project_engagements|source_selections|source_reported_figures)/iu)
    expect(sql).not.toMatch(/\b(?:update|delete)\s+public\./iu)
    expect(sql).not.toMatch(/Yong Mei|Eo Gi[oó]|EO-GIO-YONG-MEI|7e7e3904-d53b-4337-9360-22256887474a|22727545-1534-4c1a-9378-06969cb40f97|087485b2-d63f-45a3-90cf-5693abbf25d9|83cbc0d2-568b-4b17-b5a8-779f218dbd37/iu)
  })
})
