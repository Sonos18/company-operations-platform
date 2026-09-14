import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migrationName = /_taskovia_c1_acceptance_prerequisites\.sql$/
const normalizeEol = (value: string) => value.replace(/\r\n/g, '\n')
const appliedMigrations = {
  '20260911145035_taskovia_c1_foundation.sql': '538025216FEC8B67A8A94226D67B35F723D005069AEA00B003FB4DCE6089C556',
  '20260913082034_taskovia_c1_controlled_import.sql': 'C82FFC2426239A815EFD50BC01C874A7038A61FE2E5EAE662A828E024E26FB7F',
  '20260913151754_taskovia_c1_canonical_order_fix.sql': '37FF2F59F732785724E0433DDECBBE0621BBF8D595913D5FAF5EAD2955C1AFB7',
}

describe('C1 acceptance prerequisites migration contract', () => {
  it('adds only the approved persistent prerequisites with collision checks', () => {
    const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter(name => migrationName.test(name))
    expect(migrations).toHaveLength(1)
    const sql = normalizeEol(readFileSync(resolve(root, 'supabase/migrations', migrations[0]!), 'utf8'))

    for (const value of [
      "'c1000000-0000-4000-8000-000000000010'", "'c1-acceptance'", "'Taskovia C1 Acceptance'", "'shared'",
      "'c1000000-0000-4000-8000-000000000020'", "'C1-ACCEPTANCE-A1'", "'Taskovia C1 Acceptance Primary'",
      "'c1000000-0000-4000-8000-000000000021'", "'C1-ACCEPTANCE-A2'", "'Taskovia C1 Acceptance Denial Target'",
      "'c1000000-0000-4000-8000-000000000911'", "'c1_acceptance_importer'", "'C1 acceptance importer'", "'Synthetic C1 acceptance import capability'",
      "'c1000000-0000-4000-8000-000000000912'", "'c1_acceptance_source_only'", "'C1 acceptance source-only'", "'Synthetic C1 acceptance source-only capability'",
      "'taskovia-vqh-project-cost-workbooks-v1'", "'taskovia-vqh-project-cost-workbooks'", "'0.1.0-candidate'",
    ]) expect(sql).toContain(value)

    expect(sql).toMatch(/c1000000-0000-4000-8000-000000000911[\s\S]*?c1_acceptance_importer[\s\S]*?Synthetic C1 acceptance import capability[\s\S]*?false, false, true/iu)
    expect(sql).toMatch(/c1000000-0000-4000-8000-000000000912[\s\S]*?c1_acceptance_source_only[\s\S]*?Synthetic C1 acceptance source-only capability[\s\S]*?false, false, true/iu)
    expect(sql).toMatch(/000000000911[\s\S]*?cost\.source\.read[\s\S]*?000000000911[\s\S]*?cost\.prepare[\s\S]*?000000000912[\s\S]*?cost\.source\.read/iu)
    expect(sql).toContain('insert into public.role_permissions')
    expect(sql).toContain('on conflict do nothing')
    expect(sql).toMatch(/raise exception 'C1_ACCEPTANCE_PREREQUISITE_CONFLICT'/u)
    expect(sql).toMatch(/from public\.permissions[\s\S]*?cost\.source\.read[\s\S]*?cost\.prepare/iu)
    expect(sql).toMatch(/from public\.role_permissions[\s\S]*?except[\s\S]*?from public\.role_permissions/iu)
    expect(sql).toContain("array['cost.source.read', 'cost.prepare']::text[]")
    expect(sql).toContain("array['cost.source.read']::text[]")
    expect(sql).toContain('insert into private.controlled_import_adapter_versions')

    expect(sql).not.toMatch(/\b(?:update|delete)\b/iu)
    expect(sql).not.toMatch(/(?:auth\.users|tenant_memberships|company_memberships|company_role_assignments|company_cost_settings)/iu)
    expect(sql).not.toMatch(/(?:controlled_import_runs|controlled_import_descriptor_map|accounting_sources|accounting_source_versions|source_selections|source_reported_figures|source_review_issues|cost_command_receipts|cost_document_events|projects|business_parties|project_engagements|engagement_components)/iu)
    expect(sql).not.toContain('10000000-0000-4000-8000-000000000020')
  })

  it('keeps the three applied C1 migrations immutable across checkout EOLs', () => {
    for (const [name, hash] of Object.entries(appliedMigrations)) {
      const sql = normalizeEol(readFileSync(resolve(root, 'supabase/migrations', name), 'utf8'))
      expect(createHash('sha256').update(sql).digest('hex').toUpperCase()).toBe(hash)
    }
  })
})
