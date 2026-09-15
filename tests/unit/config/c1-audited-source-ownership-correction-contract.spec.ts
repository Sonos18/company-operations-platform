import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationName = /_c1_audited_source_ownership_correction\.sql$/u

function migrationSql() {
  const names = readdirSync(resolve(root, 'supabase/migrations')).filter(name => migrationName.test(name))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(root, 'supabase/migrations', names[0]!), 'utf8')
}

describe('C1 audited source-ownership correction contract', () => {
  it('provides one generalized, private, token-audited correction path', () => {
    const sql = migrationSql()

    expect(sql).toContain('create table private.c1_source_ownership_correction_tokens')
    expect(sql).toContain('private.c1_correct_source_selection_ownership')
    expect(sql).toContain('private.c1_correct_source_reported_figure_ownership')
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain("private.c1_master_context(v_source.company_id, 'cost.correct')")
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('txid_current()')
    expect(sql).toContain('pg_backend_pid()')
    expect(sql).toContain('insert into public.audit_events')
    expect(sql).toContain('before_summary')
    expect(sql).toContain('after_summary')
    const controlledImportSql = readFileSync(resolve(root, 'supabase/migrations/20260913082034_taskovia_c1_controlled_import.sql'), 'utf8')
    expect(controlledImportSql).toContain('c1_source_selections_immutable')
    expect(controlledImportSql).toContain('c1_source_reported_figures_immutable')
    expect(sql).toContain("message = 'HISTORY_IMMUTABLE'")

    expect(sql).toMatch(/revoke all on table private\.c1_source_ownership_correction_tokens from public, anon, authenticated/iu)
    expect(sql).toMatch(/revoke all on function private\.c1_correct_source_selection_ownership\([^)]*\) from public, anon, authenticated/iu)
    expect(sql).toMatch(/revoke all on function private\.c1_correct_source_reported_figure_ownership\([^)]*\) from public, anon, authenticated/iu)
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+private\.c1_source_ownership_correction_tokens\s+to\s+(?:anon|authenticated|public)/iu)
    expect(sql).not.toMatch(/grant execute on function private\.c1_correct_source_(?:selection|reported_figure)_ownership/iu)
    expect(sql).not.toMatch(/session_replication_role|disable\s+trigger|alter\s+table[\s\S]*?disable/iu)
    expect(sql).not.toMatch(/execute\s*(?:\(|immediate)?|set_config\s*\(/iu)
    expect(sql).not.toMatch(/target_(?:actor|table|column|sql|patch|tenant)_/iu)
    expect(sql).not.toMatch(/mapped_component_id|component_id/iu)
    expect(sql).not.toMatch(/Yong Mei|Eo Gi[oó]|EO-GIO-YONG-MEI|7e7e3904-d53b-4337-9360-22256887474a|22727545-1534-4c1a-9378-06969cb40f97|087485b2-d63f-45a3-90cf-5693abbf25d9|83cbc0d2-568b-4b17-b5a8-779f218dbd37/iu)

    expect(sql).toMatch(/private\.c1_correct_source_selection_ownership\(\s*target_selection_id uuid,\s*target_project_id uuid,\s*target_party_id uuid,\s*target_engagement_id uuid,\s*target_reason text\s*\)/iu)
    expect(sql).toMatch(/private\.c1_correct_source_reported_figure_ownership\(\s*target_figure_id uuid,\s*target_project_id uuid,\s*target_party_id uuid,\s*target_engagement_id uuid,\s*target_reason text\s*\)/iu)
    expect(sql).toContain("array['mapped_project_id', 'mapped_party_id', 'mapped_engagement_id']::text[]")
    expect(sql).toContain("array['project_id', 'party_id', 'engagement_id']::text[]")
    expect(sql).toContain("if TG_OP = 'DELETE' then")
    expect(sql).toContain('delete from private.c1_source_ownership_correction_tokens token')
    expect(sql).toContain('token.actor_user_id = auth.uid()')
    expect(sql).toContain('engagement.party_id = target_party_id')
    expect(sql).not.toMatch(/create function public\.c1_correct_source_/iu)

    for (const [functionName, tableName] of [
      ['c1_correct_source_selection_ownership', 'source_selections'],
      ['c1_correct_source_reported_figure_ownership', 'source_reported_figures'],
    ]) {
      const start = sql.indexOf(`create function private.${functionName}`)
      const end = sql.indexOf('$$;', start)
      const functionSql = sql.slice(start, end)
      const auditIndex = functionSql.indexOf('insert into public.audit_events')
      const tokenIndex = functionSql.indexOf('insert into private.c1_source_ownership_correction_tokens')
      const updateIndex = functionSql.indexOf(`update public.${tableName}`)
      expect(auditIndex).toBeGreaterThan(-1)
      expect(tokenIndex).toBeGreaterThan(auditIndex)
      expect(updateIndex).toBeGreaterThan(tokenIndex)
    }
  })
})
