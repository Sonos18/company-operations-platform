import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationName = /_c1_project_cost_items\.sql$/u
const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter(name => migrationName.test(name))
const sql = migrations.length === 1 ? readFileSync(resolve(root, 'supabase/migrations', migrations[0]!), 'utf8') : ''
const permissions = readFileSync(resolve(root, 'shared/constants/permissions.ts'), 'utf8')

describe('C1 Project Cost database foundation', () => {
  it('prepares exactly one forward Project Cost migration', () => {
    expect(migrations).toHaveLength(1)
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
    expect(sql).toContain("private.has_company_permission(tenant_id, company_id, 'cost.read')")
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.project_cost(?:_item_sources|_items)\s+to\s+authenticated/iu)
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
  })
})
