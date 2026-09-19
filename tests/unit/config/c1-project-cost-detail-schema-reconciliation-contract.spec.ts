import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const names = readdirSync(resolve(root, 'supabase/migrations')).filter(name => /_c1_project_cost_detail_schema_reconciliation\.sql$/u.test(name))
const sql = names.length === 1 ? readFileSync(resolve(root, 'supabase/migrations', names[0]!), 'utf8') : ''

describe('C1 Project Cost Detail schema reconciliation', () => {
  it('implements catalog-backed, fail-closed reconciliation without rewriting details', () => {
    expect(names).toHaveLength(1)
    const executableSql = sql.replace(/^\s*--.*$/gmu, '').replace(/create table if not exists public\.project_cost_item_details\s*\([\s\S]*?\n\);/iu, '')
    const requiredChecks = [
      'project_cost_item_details_line_no_check', 'project_cost_item_details_detail_kind_check', 'project_cost_item_details_description_check',
      'project_cost_item_details_quantity_text_check', 'project_cost_item_details_unit_code_check', 'project_cost_item_details_unit_price_text_check',
      'project_cost_item_details_amount_text_check', 'project_cost_item_details_reference_check', 'project_cost_item_details_version_check',
      'project_cost_item_details_retention_kind_check', 'project_cost_item_details_retention_rate_bps_check', 'project_cost_item_details_retention_amount_text_check',
      'project_cost_item_details_retention_amount_lte_amount_check', 'project_cost_item_details_retention_shape_check',
    ]

    for (const name of requiredChecks) expect(sql).toContain(name)
    expect(executableSql).toMatch(/for v_expected_constraint in[\s\S]*?pg_constraint[\s\S]*?pg_temp\.c1_pcd_contract[\s\S]*?contype = 'c'/iu)
    expect(executableSql).toContain("retention_amount_text ~ '^[0-9]{1,16}([.][0-9]{1,4})?$'")

    const syncFunction = sql.match(/create or replace function private\.c1_sync_project_cost_item_amount\(target_id uuid\)[\s\S]*?\n\$\$;/iu)?.[0] ?? ''
    expect(syncFunction).toContain('sum(detail.amount_text::numeric)')
    expect(syncFunction).toContain('amount is distinct from v_amount')
    expect(syncFunction).toContain('amount_text = v_amount::text')
    expect(syncFunction).not.toContain('to_char(')
    expect(syncFunction).not.toContain('amount_text is distinct from')

    const catalogNameArrays = [...executableSql.matchAll(/array_agg\(attribute\.attname::text order by key_column\.ordinality\)/giu)]
    expect(catalogNameArrays).toHaveLength(5)
    expect(executableSql).not.toMatch(/array_agg\(attribute\.attname\s+order by key_column\.ordinality\)/iu)
    expect(executableSql).toMatch(/if not found then\s+select \* into v_constraint from pg_constraint constraint_row\s+where constraint_row\.conrelid = v_table and constraint_row\.contype = 'f'[\s\S]*?= v_expected\.local_columns/iu)

    for (const fragment of [
      'pg_attribute', 'pg_attrdef', 'pg_get_expr', 'attnotnull', 'C1_PCD_SCHEMA_DRIFT_COLUMN',
      'pg_constraint', "contype = 'c'", 'add constraint', 'not valid', 'validate constraint',
      'conkey', "'p'::\"char\"", "'u'::\"char\"", 'C1_PCD_SCHEMA_DRIFT_KEY',
      'confkey', 'confrelid', 'confdeltype', 'on delete cascade', 'C1_PCD_SCHEMA_DRIFT_FOREIGN_KEY',
      'pg_index', 'pg_get_indexdef', 'indisvalid', 'indisready', 'project_cost_item_details_scope_idx',
      'enable row level security', 'force row level security', 'revoke all on table', 'grant select on table',
      'pg_policy', 'polcmd', 'polroles', 'polpermissive', 'c1_project_cost_item_details_select', 'private.c1_can_read_project_cost',
      'private.c1_sync_project_cost_item_amount', 'sum(detail.amount_text::numeric)', 'private.c1_project_cost_detail_sync_trigger',
      'private.c1_guard_derived_project_cost_amount', 'PROJECT_COST_AMOUNT_DERIVED',
      'c1_project_cost_item_details_sync', 'deferrable initially deferred', 'c1_project_cost_items_amount_derived_guard',
      'not exists (', 'detail.tenant_id = item.tenant_id', 'detail.company_id = item.company_id',
      'group by detail.project_cost_item_id, detail.line_no', 'PROJECT_COST_DETAIL_RECONCILIATION_DRIFT',
      'retention_kind', 'retention_rate_bps', 'retention_amount_text', 'retention_amount_text::numeric <= amount_text::numeric',
    ]) expect(executableSql.toLowerCase()).toContain(fragment.toLowerCase())

    expect(sql).toMatch(/create table if not exists public\.project_cost_item_details\s*\((?:(?!\b(?:primary key|unique|references|check)\b)[\s\S])*?\n\);/iu)
    expect(executableSql).toMatch(/project_cost_item_details_pkey[\s\S]*?project_cost_item_details_id_tenant_id_company_id_key[\s\S]*?project_cost_item_details_project_cost_item_id_line_no_key/iu)
    expect(executableSql).toMatch(/project_cost_item_details_company_id_tenant_id_fkey[\s\S]*?project_cost_item_details_project_cost_item_id_tenant_id_company_id_fkey[\s\S]*?project_cost_item_details_created_by_fkey/iu)
    expect(executableSql).not.toMatch(/\b(?:delete from|update)\s+public\.project_cost_item_details\b/iu)
    expect(executableSql).not.toMatch(/drop\s+constraint/iu)
    expect(sql).not.toMatch(/(?:Eo Gi|Yong Mei|7e7e3904|22727545|create function public\.c1_.*detail)/iu)
  })
})
