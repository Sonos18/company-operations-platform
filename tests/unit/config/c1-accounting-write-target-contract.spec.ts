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

    expect(sql).toMatch(/publication_state text/iu)
    expect(sql).toMatch(/update public\.project_cost_items[\s\S]*publication_state = 'published'/iu)
    expect(sql).toContain("'legacy_backfill'")
    expect(sql).toContain("default 'draft'")
    expect(sql).toContain("role.code = 'accountant'")
    expect(sql).toContain("private.has_company_permission(target_tenant_id, target_company_id, 'cost.read')")
    expect(sql).toContain("private.has_company_permission(target_tenant_id, target_company_id, 'cost.prepare')")
    expect(sql).toContain("private.has_company_permission(target_tenant_id, target_company_id, 'cost.manage')")
    for (const permission of ['cost.file.read', 'cost.manage', 'cost.prepare', 'cost.publish_import', 'cost.correct', 'cost.record_cash']) {
      expect(sql).toContain(`'${permission}'`)
    }
    for (const signature of [
      'public.c1_create_project_cost_item(uuid, jsonb, uuid, uuid)',
      'public.c1_update_project_cost_item(uuid, uuid, jsonb, uuid)',
      'public.c1_correct_project_cost_item(uuid, uuid, jsonb, uuid)',
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`)
    }
    expect(sql).not.toContain('grant execute on function public.c1_create_project_cost_item')
    expect(sql).not.toContain('grant execute on function public.c1_update_project_cost_item')
    expect(sql).not.toContain('grant execute on function public.c1_correct_project_cost_item')
  })
})
