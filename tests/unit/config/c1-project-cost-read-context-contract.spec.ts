import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const readContextMigrationName = /_c1_project_cost_read_context\.sql$/u
const oldMetadataMigrationName = /_c1_project_cost_project_metadata_read\.sql$/u

function getMigrationSql(pattern: RegExp) {
  const names = readdirSync(resolve(root, 'supabase/migrations')).filter(name => pattern.test(name))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(root, 'supabase/migrations', names[0]!), 'utf8')
}

describe('C1 Project Cost read-context migration contract', () => {
  it('implements private worker and public wrapper under cost.read security boundary', () => {
    const sql = getMigrationSql(readContextMigrationName)

    expect(sql).toContain('create function private.c1_read_project_cost_read_context(')
    expect(sql).toContain('create function public.c1_read_project_cost_read_context(')
    expect(sql).toContain("private.c1_master_context(target_company_id, 'cost.read')")
    expect(sql).toContain('target_company_id uuid')
    expect(sql).toContain('target_project_id uuid')
    expect(sql).toContain('returns jsonb')
    expect(sql).toContain('security definer')
    expect(sql).toContain("set search_path = ''")
  })

  it('validates project ownership without requiring project_cost_items rows (zero-item support)', () => {
    const sql = getMigrationSql(readContextMigrationName)

    expect(sql).toContain('from public.projects p')
    expect(sql).toContain('p.tenant_id = v_tenant_id')
    expect(sql).toContain('p.company_id = target_company_id')
    expect(sql).toContain('p.id = target_project_id')
    // Must NOT contain the restrictive exists clause present in old metadata RPC
    expect(sql).not.toMatch(/exists\s*\(\s*select\s+1\s+from\s+public\.project_cost_items/iu)
    expect(sql).toContain("raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'")
  })

  it('reads enabled company cost settings internally and enforces MODULE_DISABLED semantics', () => {
    const sql = getMigrationSql(readContextMigrationName)

    expect(sql).toContain('from public.company_cost_settings s')
    expect(sql).toContain('s.tenant_id = v_tenant_id')
    expect(sql).toContain('s.company_id = target_company_id')
    expect(sql).toContain('s.enabled = true')
    expect(sql).toContain("raise exception using errcode = 'P0001', message = 'MODULE_DISABLED'")
  })

  it('projects only the required minimal read context and does not leak configuration details', () => {
    const sql = getMigrationSql(readContextMigrationName)

    expect(sql).toContain("'projectId', v_project.id")
    expect(sql).toContain("'projectCode', v_project.code")
    expect(sql).toContain("'projectName', v_project.name")
    expect(sql).toContain("'defaultCurrencyCode', v_settings.default_currency_code")
    expect(sql).toContain("'moneyScale', v_settings.money_scale")
    expect(sql).toContain("'timeZone', v_settings.time_zone")

    // Does not expose metadata fields or extraneous company config
    for (const field of ['version', 'created_at', 'updated_at', 'created_by', 'operational_state']) {
      expect(sql).not.toContain(`'${field}'`)
    }
  })

  it('strictly protects execution permissions and denies anon and unauthenticated callers', () => {
    const sql = getMigrationSql(readContextMigrationName)

    expect(sql).toContain('revoke all on function private.c1_read_project_cost_read_context(uuid, uuid) from public, anon, authenticated')
    expect(sql).toContain('revoke all on function public.c1_read_project_cost_read_context(uuid, uuid) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.c1_read_project_cost_read_context(uuid, uuid) to authenticated')
    expect(sql).not.toMatch(/grant execute on function (?:public|private)\.c1_read_project_cost_read_context.*to anon/iu)
  })

  it('does not alter or widen table-level RLS on company_cost_settings or introduce service-role bypass', () => {
    const sql = getMigrationSql(readContextMigrationName)

    expect(sql).not.toMatch(/\bcreate\s+policy\b/iu)
    expect(sql).not.toMatch(/\balter\s+policy\b/iu)
    expect(sql).not.toMatch(/\bdrop\s+policy\b/iu)
    expect(sql).not.toMatch(/\bservice_role\b/iu)
  })

  it('preserves the existing c1_read_project_cost_project_metadata migration completely untouched', () => {
    const oldSql = getMigrationSql(oldMetadataMigrationName)

    expect(oldSql).toContain('create function private.c1_read_project_cost_project_metadata(')
    expect(oldSql).toContain('create function public.c1_read_project_cost_project_metadata(')
    expect(oldSql).toContain('and exists (')
    expect(oldSql).toContain('from public.project_cost_items cost_item')
  })

  it('has generated accurate database types for the new RPC', () => {
    const typesContent = readFileSync(resolve(root, 'shared/types/database.types.ts'), 'utf8')

    expect(typesContent).toContain('c1_read_project_cost_read_context: {')
    expect(typesContent).toContain('Args: { target_company_id: string; target_project_id: string }')
    expect(typesContent).toContain('Returns: Json')
    expect(typesContent).toContain('c1_read_project_cost_project_metadata: {')
  })
})
