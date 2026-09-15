import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migration = () => {
  const name = readdirSync(resolve(root, 'supabase/migrations')).find(value => /_c1_director_source_read_access\.sql$/u.test(value))
  expect(name).toBeDefined()
  return readFileSync(resolve(root, 'supabase/migrations', name!), 'utf8')
}

describe('C1 Director source-read access contract', () => {
  it('separates source-facing reads from preparer-only import internals', () => {
    const sql = migration()
    expect(sql).toContain('create function private.c1_can_read_source')
    for (const table of ['accounting_sources', 'accounting_source_versions', 'source_selections', 'source_reported_figures', 'source_review_issues']) {
      expect(sql).toMatch(new RegExp(`create policy c1_${table}_select[\\s\\S]*?private\\.c1_can_read_source`, 'u'))
    }
    expect(sql).not.toMatch(/create policy c1_(?:controlled_import_runs|controlled_import_descriptor_map)_select[\\s\\S]*?c1_can_read_source/u)
  })

  it('adds minimal source-read and hierarchy RPC boundaries without weakening import-result access', () => {
    const sql = migration()
    expect(sql).toContain('create function public.c1_probe_cost_source_read')
    expect(sql).toContain('create function public.c1_read_cost_source_hierarchy')
    expect(sql).toContain("private.c1_master_context(target_company_id, 'cost.source.read')")
    expect(sql).toContain('private.has_company_permission')
    expect(sql).toMatch(/security definer\s+set search_path = ''/iu)
    const importMigration = readFileSync(resolve(root, 'supabase/migrations/20260913082034_taskovia_c1_controlled_import.sql'), 'utf8')
    expect(importMigration).toContain("private.has_company_permission(v_tenant_id, target_company_id, 'cost.prepare')")
  })

  it('keeps writes, import internals, and broad master-table reads outside the viewer boundary', () => {
    const sql = migration()
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.(?:accounting_sources|accounting_source_versions|source_selections|source_reported_figures|source_review_issues)/iu)
    expect(sql).not.toMatch(/create policy c1_(?:controlled_import_runs|controlled_import_descriptor_map|controlled_import_events)_select[\s\S]*?c1_can_read_source/u)
    expect(sql).not.toMatch(/grant\s+select\s+on\s+public\.(?:projects|project_engagements|business_parties)\s+to\s+authenticated/iu)
    for (const field of ['client_display_name', 'tax_identifier', 'contract_reference', 'raw_file_reference', 'manifest_snapshot']) expect(sql).not.toContain(field)
  })
})
