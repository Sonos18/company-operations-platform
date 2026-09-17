import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationName = /_c1_project_cost_items\.sql$/u
const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter(name => migrationName.test(name))
const sql = migrations.length === 1 ? readFileSync(resolve(root, 'supabase/migrations', migrations[0]!), 'utf8') : ''
const provenanceMigrationName = /_c1_project_cost_item_provenance_command\.sql$/u
const provenanceMigrations = readdirSync(resolve(root, 'supabase/migrations')).filter(name => provenanceMigrationName.test(name))
const provenanceSql = provenanceMigrations.length === 1 ? readFileSync(resolve(root, 'supabase/migrations', provenanceMigrations[0]!), 'utf8') : ''
const permissions = readFileSync(resolve(root, 'shared/constants/permissions.ts'), 'utf8')
const fixturePath = resolve(root, 'supabase/tests/database/c1/c1_project_cost_items.test.sql')
const fixtureSql = existsSync(fixturePath) ? readFileSync(fixturePath, 'utf8').replace(/\r\n?/g, '\n').trim() : ''

describe('C1 Project Cost database foundation', () => {
  it('prepares exactly one forward Project Cost migration', () => {
    expect(migrations).toHaveLength(1)
  })

  it('prepares exactly one forward Project Cost provenance-command migration', () => {
    expect(provenanceMigrations).toHaveLength(1)
  })

  it('extends only the private create command with optional scoped provenance input', () => {
    expect(provenanceSql).toContain('create or replace function private.c1_create_project_cost_item(')
    expect(provenanceSql).toContain('target_company_id uuid')
    expect(provenanceSql).toContain('target_input jsonb')
    expect(provenanceSql).toContain('target_idempotency_key uuid')
    expect(provenanceSql).toContain('target_request_id uuid')
    expect(provenanceSql).toContain("'sourceFigureIds'")
    expect(provenanceSql).toContain('jsonb_typeof(target_input->\'sourceFigureIds\')')
    expect(provenanceSql).toContain('jsonb_array_length(target_input->\'sourceFigureIds\') > 0')
    expect(provenanceSql).toContain('jsonb_array_elements(target_input->\'sourceFigureIds\')')
    expect(provenanceSql).toContain("message = 'INPUT_INVALID'")
    expect(provenanceSql).toContain('public.source_reported_figures')
    expect(provenanceSql).toContain('tenant_id = v_tenant_id')
    expect(provenanceSql).toContain('company_id = target_company_id')
    expect(provenanceSql).toContain("message = 'RESOURCE_NOT_FOUND'")
    expect(provenanceSql).toContain('insert into public.project_cost_item_sources')
    expect(provenanceSql).toContain("'sourceFigureIds'")
    expect(provenanceSql).not.toMatch(/create function public\.c1_(?:create_project_cost_item_source|link_project_cost_source|attach_project_cost_source)/iu)
  })

  it('uses the canonical 8-4-4-4-12 UUID grammar for source figure IDs', () => {
    const sourceUuidPattern = provenanceSql.match(/source_figure_id\s+#>>\s+'\{\}'\s*!~\*\s+'([^']+)'/iu)?.[1]

    expect(sourceUuidPattern).toBe('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    expect(new RegExp(sourceUuidPattern!, 'iu').test('c1010000-0000-4000-8000-000000000604')).toBe(true)
  })

  it('establishes sourceFigureIds as an array before every array-only operation', () => {
    const typeGuard = "if jsonb_typeof(target_input->'sourceFigureIds') is distinct from 'array' then"
    const typeGuardIndex = provenanceSql.indexOf(typeGuard)

    expect(typeGuardIndex).toBeGreaterThanOrEqual(0)
    for (const arrayOperation of [
      "jsonb_array_length(target_input->'sourceFigureIds')",
      "jsonb_array_elements(target_input->'sourceFigureIds')",
      "jsonb_array_elements_text(target_input->'sourceFigureIds')",
    ]) {
      const operationIndex = provenanceSql.indexOf(arrayOperation)
      expect(operationIndex).toBeGreaterThan(typeGuardIndex)
      expect(provenanceSql.slice(0, typeGuardIndex)).not.toContain(arrayOperation)
    }
  })

  it('requires synthetic provenance command fixture assertions while preserving source-reuse and direct-write denial', () => {
    for (const assertion of ['C1_PC_PROVENANCE_COMMAND', 'C1_PC_PROVENANCE_DUPLICATE_INPUT', 'C1_PC_PROVENANCE_SCOPE', 'C1_PC_PROVENANCE_IDEMPOTENT', 'C1_PC_F07_SOURCE_REUSE', 'C1_PC_SOURCE_DIRECT_ACL']) expect(fixtureSql).toContain(assertion)
  })

  it('requires synthetic non-array and malformed source UUID rejection assertions', () => {
    for (const assertion of ['C1_PC_PROVENANCE_INVALID_SHAPE', 'C1_PC_PROVENANCE_INVALID_UUID']) expect(fixtureSql).toContain(assertion)
  })

  it('uses only lowercase hexadecimal characters in synthetic 64-character digest generators', () => {
    const digestCharacters = [...fixtureSql.matchAll(/repeat\('([^'])',\s*64\)/gu)].map(([, character]) => character)

    expect(digestCharacters.length).toBeGreaterThan(0)
    for (const character of digestCharacters) expect(character).toMatch(/^[a-f0-9]$/u)
  })

  it('verifies provenance audit only after the authenticated provenance command block resets role', () => {
    const provenanceItemIndex = fixtureSql.indexOf("description','C101 provenance item'")
    const authenticatedStart = fixtureSql.lastIndexOf('set local role authenticated;', provenanceItemIndex)
    const authenticatedEnd = fixtureSql.indexOf('reset role;', provenanceItemIndex)
    const authenticatedBlock = fixtureSql.slice(authenticatedStart, authenticatedEnd)
    const privilegedAuditBlock = fixtureSql.slice(authenticatedEnd, fixtureSql.indexOf('insert into public.project_cost_items', authenticatedEnd))

    expect(authenticatedStart).toBeGreaterThanOrEqual(0)
    expect(authenticatedEnd).toBeGreaterThan(authenticatedStart)
    for (const protectedTable of ['public.audit_events', 'public.cost_command_receipts']) {
      expect(authenticatedBlock).not.toContain(protectedTable)
      expect(privilegedAuditBlock).toContain(protectedTable)
    }
    expect(privilegedAuditBlock).toContain("request_id = 'c1010000-0000-4000-8000-000000000753'")
    expect(privilegedAuditBlock).toContain("C1_PC_PROVENANCE_AUDIT")
    expect(privilegedAuditBlock).toContain("C1_PC_PROVENANCE_FAILED_CREATE_RESIDUE")
    expect(privilegedAuditBlock).toContain("'sourceFigureIds'")
    for (const idempotencyKey of ['754', '762', '764', '756']) expect(privilegedAuditBlock).toContain(`c1010000-0000-4000-8000-000000000${idempotencyKey}`)
  })

  it('adds cost.manage to the shared permission catalog', () => {
    expect(permissions).toContain("'cost.manage'")
  })

  it('creates only the two Project Cost domain tables', () => {
    if (!sql) return
    expect([...sql.matchAll(/create table public\.project_cost(?:_item_sources|_items)\b/giu)]).toHaveLength(2)
    for (const table of ['project_cost_items', 'project_cost_item_sources']) expect(sql).toContain(`create table public.${table}`)
    expect(sql).not.toMatch(/create table public\.(?:project_cost_item_revisions|ledger|payments?|invoices?|cash|payables?|receivables?|revenue|budgets?|forecasts?|profit)/iu)
  })

  it('enforces the Project Cost item boundary and scope relationships', () => {
    if (!sql) return
    for (const fragment of [
      'amount numeric(20,4) not null check (amount >= 0)',
      'amount_text text not null',
      "check (amount_text ~ '^\\d{1,16}(\\.\\d{1,4})?$')",
      'check (amount_text::numeric = amount)',
      "work_status text not null check (work_status in ('unknown','in_progress','accepted'))",
      'currency_code text not null check (char_length(currency_code) = 3)',
      'description text not null check (btrim(description) <> \'\')',
      'version bigint not null default 0 check (version >= 0)',
      'foreign key (project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id)',
      'foreign key (party_id, tenant_id, company_id) references public.business_parties(id, tenant_id, company_id)',
      'foreign key (engagement_id, tenant_id, company_id, project_id) references public.project_engagements(id, tenant_id, company_id, project_id)',
      'foreign key (component_id, tenant_id, company_id, engagement_id) references public.engagement_components(id, tenant_id, company_id, engagement_id)',
      'check (component_id is null or engagement_id is not null)',
    ]) expect(sql).toContain(fragment)
    expect(sql).toMatch(/create unique index project_cost_items_business_reference_unique[\s\S]*?\(tenant_id, company_id, project_id, business_reference\)[\s\S]*?where business_reference is not null/iu)
    expect(sql).toMatch(/create index project_cost_items_project_status_idx on public\.project_cost_items\(tenant_id, company_id, project_id, work_status/iu)
  })

  it('keeps source figures as scoped provenance with relation-pair uniqueness only', () => {
    if (!sql) return
    expect(sql).toContain('unique (project_cost_item_id, source_reported_figure_id)')
    expect(sql).not.toMatch(/unique\s*\(\s*source_reported_figure_id\s*\)/iu)
    expect(sql).toContain('foreign key (project_cost_item_id, tenant_id, company_id) references public.project_cost_items(id, tenant_id, company_id)')
    expect(sql).toContain('foreign key (source_reported_figure_id, tenant_id, company_id) references public.source_reported_figures(id, tenant_id, company_id)')
    expect(sql).toMatch(/create index project_cost_item_sources_figure_idx on public\.project_cost_item_sources\(tenant_id, company_id, source_reported_figure_id/iu)
  })

  it('forces RLS and denies direct authenticated mutation', () => {
    if (!sql) return
    for (const table of ['project_cost_items', 'project_cost_item_sources']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`alter table public.${table} force row level security`)
    }
    expect(sql).toContain("private.has_company_permission(target_tenant_id, target_company_id, 'cost.read')")
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.project_cost(?:_item_sources|_items)\s+to\s+authenticated/iu)
  })

  it('grants authenticated SELECT on both Project Cost tables subject to module-aware cost.read RLS', () => {
    if (!sql) return
    expect(sql).toContain('grant select on public.project_cost_items, public.project_cost_item_sources to authenticated')
    expect(sql).toMatch(/create function private\.c1_can_read_project_cost\(target_tenant_id uuid, target_company_id uuid\)[\s\S]*?public\.company_cost_settings[\s\S]*?settings\.enabled[\s\S]*?'cost\.read'/iu)
    for (const table of ['project_cost_items', 'project_cost_item_sources']) {
      expect(sql).toContain(`create policy c1_${table}_select on public.${table} for select to authenticated using (private.c1_can_read_project_cost(tenant_id, company_id))`)
    }
  })

  it('uses a calendar-safe date parser from both direct command paths', () => {
    if (!sql) return
    const functionSql = (name: string) => sql.slice(sql.indexOf(`create function private.${name}`), sql.indexOf('$$;', sql.indexOf(`create function private.${name}`)))
    expect(sql).toMatch(/create function private\.c1_parse_project_cost_date\(target_value text\)[\s\S]*?to_date[\s\S]*?datetime_field_overflow[\s\S]*?invalid_datetime_format[\s\S]*?INPUT_INVALID/iu)
    expect(functionSql('c1_create_project_cost_item')).toContain('private.c1_parse_project_cost_date')
    expect(functionSql('c1_update_project_cost_item')).toContain('private.c1_parse_project_cost_date')
  })

  it('adds only cost.manage and grants it to the dedicated VQH operator role', () => {
    if (!sql) return
    expect(sql).toMatch(/insert into public\.permissions\(code, module, name, description\) values\s*\(\s*'cost\.manage'/iu)
    expect(sql).toContain("role.code = 'c1_vqh_cost_operator'")
    expect(sql).toContain("permission.code = 'cost.manage'")
    expect(sql).toContain('v_active_actor_count <> 1')
    expect(sql).not.toMatch(/permission\.code\s*=\s*'(?:cost\.read|cost\.correct)'/iu)
  })

  it('exposes only the three guarded Project Cost RPCs', () => {
    if (!sql) return
    for (const command of ['create', 'update', 'correct']) {
      expect(sql).toContain(`create function private.c1_${command}_project_cost_item`)
      expect(sql).toContain(`create function public.c1_${command}_project_cost_item`)
    }
    expect(sql).toContain("private.c1_master_context(target_company_id, 'cost.manage')")
    expect(sql).toContain("private.c1_master_context(target_company_id, 'cost.correct')")
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('revoke all on function public.c1_create_project_cost_item')
    expect(sql).toContain('grant execute on function public.c1_create_project_cost_item')
    expect(sql).not.toContain('c1_create_project_cost_item_source')
  })

  it('keeps create idempotent and records immutable Project Cost audit history', () => {
    if (!sql) return
    for (const fragment of [
      'private.c1_jsonb_canonical_text',
      'pg_advisory_xact_lock',
      'public.cost_command_receipts',
      "message = 'IDEMPOTENCY_CONFLICT'",
      'insert into public.audit_events',
      'nonOverlapConfirmationReference',
      "'project_cost_item'",
      "message = 'VERSION_CONFLICT'",
      'for update',
      'version = version + 1',
    ]) expect(sql).toContain(fragment)
    expect(sql).not.toContain('cost_document_events')
    expect(sql).toContain("v_amount, target_input->>'amount'")
    expect(sql).toContain("amount = v_amount, amount_text = v_amount_text")
  })

  it('requires a rollback-safe synthetic Project Cost SQL boundary fixture', () => {
    expect(existsSync(fixturePath)).toBe(true)
    if (!fixtureSql) return
    expect(fixtureSql).toMatch(/^begin\s*;/iu)
    expect(fixtureSql).toMatch(/rollback\s*;$/iu)
    expect(fixtureSql).not.toMatch(/\bcommit\s*;/iu)
    expect(fixtureSql).not.toMatch(/\b(?:VQH|Eo Gi[oó]|Yong Mei|supabase_migrations|migration repair|db reset|seed)\b/iu)
    for (const id of fixtureSql.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu)) {
      expect(id[0]).toMatch(/^c10[01][0-9a-f]{4}-/iu)
    }
    for (const rpc of ['c1_create_project_cost_item', 'c1_update_project_cost_item', 'c1_correct_project_cost_item']) expect(fixtureSql).toContain(`public.${rpc}`)
    for (const assertion of ['C1_PC_PERMISSION_BOUNDARY', 'C1_PC_F04_SAME_ROW', 'C1_PC_F05_REFERENCE', 'C1_PC_F05_NULL_REFERENCE', 'C1_PC_F07_SOURCE_REUSE', 'C1_PC_IDEMPOTENCY', 'C1_PC_VERSION_CONFLICT', 'C1_PC_AUDIT_HISTORY', 'C1_PC_PROJECT_SCOPE', 'C1_PC_MODULE_DISABLED_READ', 'C1_PC_MODULE_DISABLED_COMMAND', 'C1_PC_AUDIT_ACL', 'C1_PC_ANON_UPDATE_RPC', 'C1_PC_ANON_CORRECT_RPC', 'C1_PC_SOURCE_DIRECT_ACL', 'C1_PC_DECIMAL_SAFE_AMOUNT']) expect(fixtureSql).toContain(assertion)
    const decimal = fixtureSql.match(/(9007199254740993\.0000)/u)?.[1]
    expect(decimal).toBe('9007199254740993.0000')
    expect(BigInt(decimal!.split('.')[0]!)).not.toBe(BigInt(Number(decimal!.split('.')[0]!)))
  })
})
