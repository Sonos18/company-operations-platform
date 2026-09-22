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

  it('P2 adds guarded draft management, preparation, reads, and readiness', () => {
    const sql = phaseMigration('_c1_accounting_write_draft_commands.sql')

    for (const signature of [
      'public.c1_create_project_cost_draft',
      'public.c1_update_project_cost_draft',
      'public.c1_prepare_project_cost_financials',
      'public.c1_read_project_cost_draft',
      'public.c1_list_project_cost_drafts',
      'private.c1_project_cost_publish_readiness',
    ]) expect(sql).toContain(`function ${signature}`)
    expect(sql).toContain("'project_cost_draft.create'")
    expect(sql).toContain("private.c1_master_context(target_company_id, 'cost.manage')")
    expect(sql).toContain("private.c1_master_context(target_company_id, 'cost.prepare')")
    expect(sql).toContain("set_config('taskovia.c1_cost_write.snapshot', '1', true)")
    expect(sql).toMatch(/delete from public\.project_cost_item_details[\s\S]*insert into public\.project_cost_item_details/iu)
    expect(sql).toMatch(/delete from public\.project_cost_item_sources[\s\S]*insert into public\.project_cost_item_sources/iu)
    expect(sql).toContain("publication_state <> 'draft'")
    expect(sql).toContain("message = 'COST_NOT_DRAFT'")
    expect(sql).toContain("message = 'VERSION_CONFLICT'")
    expect(sql).toContain("message = 'SUBCONTRACT_COST_MODEL_UNSUPPORTED'")
    expect(sql).toContain('revoke all on function private.c1_project_cost_publish_readiness(uuid, uuid, uuid) from public, anon, authenticated')
    for (const signature of [
      'public.c1_create_project_cost_draft(uuid, jsonb, uuid, uuid)',
      'public.c1_update_project_cost_draft(uuid, uuid, jsonb, uuid)',
      'public.c1_prepare_project_cost_financials(uuid, uuid, jsonb, uuid)',
      'public.c1_read_project_cost_draft(uuid, uuid)',
      'public.c1_list_project_cost_drafts(uuid, uuid)',
    ]) expect(sql).toContain(`grant execute on function ${signature} to authenticated`)
  })

  it('P3 adds a private immutable evidence registry and Storage boundary', () => {
    const sql = phaseMigration('_c1_accounting_write_evidence_storage.sql')

    expect(sql).toContain('create table public.cost_evidence_files')
    expect(sql).toContain('create table public.cost_evidence_links')
    expect(sql).toContain("'c1-accounting-evidence', 'c1-accounting-evidence', false, 26214400")
    for (const mime of ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg']) expect(sql).toContain(`'${mime}'`)
    expect(sql).toContain('create policy c1_accounting_evidence_objects_insert')
    expect(sql).toContain('create policy c1_accounting_evidence_objects_select')
    expect(sql).not.toMatch(/create policy [^\n]+[\s\S]{0,100} on storage\.objects for (update|delete)/iu)
    expect(sql).toContain("private.c1_master_context(target_company_id, 'cost.prepare')")
    expect(sql).toContain("private.has_company_permission(file.tenant_id, file.company_id, 'cost.file.read')")
    expect(sql).toContain('private.c1_can_read_project_cost_child(link.tenant_id, link.company_id, link.project_cost_item_id)')
    expect(sql).toContain("private.has_company_permission(tenant_id, company_id, 'cost.source.read')")
    expect(sql).toContain('check (num_nonnulls(project_cost_item_id, project_subcontract_payment_id) = 1)')
    expect(sql).toContain('foreign key (accounting_source_version_id, tenant_id, company_id)')
    expect(sql).toMatch(/set_config\('taskovia\.c1_evidence\.finalize'\s*,\s*'1'\s*,\s*true\)/iu)
    expect(sql).toContain("message = 'HISTORY_IMMUTABLE'")
    expect(sql).toMatch(/message\s*=\s*'EVIDENCE_UPLOAD_MISMATCH'/iu)
    for (const signature of ['public.c1_create_cost_evidence_intent', 'public.c1_finalize_cost_evidence', 'public.c1_link_cost_evidence']) expect(sql).toContain(`function ${signature}`)
    expect(sql).toMatch(/revoke all on table public\.cost_evidence_files, public\.cost_evidence_links from public, anon, authenticated/iu)
    expect(sql).toMatch(/grant select on table public\.cost_evidence_files, public\.cost_evidence_links to authenticated/iu)
  })

  it('P4 adds one explicit idempotent publication command', () => {
    const sql = phaseMigration('_c1_accounting_write_publish_command.sql')
    expect(sql).toContain('function public.c1_publish_project_cost')
    expect(sql).toContain("private.c1_master_context(target_company_id, 'cost.publish_import')")
    expect(sql).toContain('private.c1_project_cost_publish_readiness')
    expect(sql).toContain("'project_cost.publish'")
    expect(sql).toContain("publication_state = 'published'")
    expect(sql).toContain("publication_origin = 'command'")
    expect(sql).toContain("'c1.project_cost_item.published'")
    for (const error of ['VERSION_CONFLICT', 'COST_ALREADY_PUBLISHED', 'COST_PUBLISH_NOT_READY', 'SUBCONTRACT_COST_MODEL_UNSUPPORTED', 'IDEMPOTENCY_CONFLICT']) expect(sql).toMatch(new RegExp(`message\\s*=\\s*'${error}'`, 'iu'))
    expect(sql).toContain('grant execute on function public.c1_publish_project_cost(uuid, uuid, bigint, uuid, uuid) to authenticated')
    expect(sql).toContain('revoke all on function private.c1_publish_project_cost(uuid, uuid, bigint, uuid, uuid) from public, anon, authenticated')
  })
})
