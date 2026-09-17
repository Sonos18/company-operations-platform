import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationName = /_c1_project_cost_project_metadata_read\.sql$/u

function migrationSql() {
  const names = readdirSync(resolve(root, 'supabase/migrations')).filter(name => migrationName.test(name))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(root, 'supabase/migrations', names[0]!), 'utf8')
}

describe('C1 Project Cost Project metadata read contract', () => {
  it('creates a cost.read-gated, scope-filtered metadata projection', () => {
    const sql = migrationSql()

    expect(sql).toContain('create function private.c1_read_project_cost_project_metadata(')
    expect(sql).toContain('create function public.c1_read_project_cost_project_metadata(')
    expect(sql).toContain("private.c1_master_context(target_company_id, 'cost.read')")
    expect(sql).toContain('from public.projects project')
    expect(sql).toContain('project.tenant_id = v_tenant_id')
    expect(sql).toContain('project.company_id = target_company_id')
    expect(sql).toContain('project.id = any(target_project_ids)')
    expect(sql).toMatch(/and exists \(\s*select 1\s*from public\.project_cost_items cost_item\s*where cost_item\.tenant_id = v_tenant_id\s*and cost_item\.company_id = target_company_id\s*and cost_item\.project_id = project\.id/iu)
    expect(sql).toContain("jsonb_build_object('projectId', project.id, 'projectCode', project.code, 'projectName', project.name)")
  })

  it('does not widen Project Register or write/RBAC boundaries', () => {
    const sql = migrationSql()

    expect(sql).not.toMatch(/c1_projects_select|create policy|project\.register\.manage|party\.manage|engagement\.manage|cost\.source\.read/iu)
    expect(sql).not.toMatch(/\b(?:insert|update|delete)\s+(?:into\s+)?public\.(?:projects|role_permissions)/iu)
    for (const field of ['client_display_name', 'location_text', 'operational_state', 'origin', 'source_opportunity_id', 'financial_scope_inventory_status', 'financial_scope_inventory_as_of', 'version', 'created_by', 'created_at', 'updated_at']) expect(sql).not.toContain(field)
  })

  it('keeps execution private by default and exposes only the public wrapper to authenticated users', () => {
    const sql = migrationSql()

    expect(sql).toContain('revoke all on function private.c1_read_project_cost_project_metadata(uuid,uuid[]) from public, anon, authenticated')
    expect(sql).toContain('revoke all on function public.c1_read_project_cost_project_metadata(uuid,uuid[]) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.c1_read_project_cost_project_metadata(uuid,uuid[]) to authenticated')
    expect(sql).not.toMatch(/grant execute on function public\.c1_read_project_cost_project_metadata\(uuid,uuid\[\]\) to anon/iu)
  })

  it('requires rollback-safe synthetic coverage for the metadata boundary', () => {
    const fixture = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_project_cost_items.test.sql'), 'utf8').replace(/\r\n?/g, '\n').trim()

    expect(fixture).toMatch(/^begin\s*;/iu)
    expect(fixture).toMatch(/rollback\s*;$/iu)
    for (const assertion of ['C1_PC_METADATA_ANON_RPC', 'C1_PC_METADATA_SCOPE', 'C1_PC_METADATA_NO_COST_PROJECT', 'C1_PC_METADATA_MINIMIZATION', 'C1_PC_METADATA_PROJECT_RLS', 'C1_PC_METADATA_PERMISSION']) expect(fixture).toContain(assertion)
  })
})
