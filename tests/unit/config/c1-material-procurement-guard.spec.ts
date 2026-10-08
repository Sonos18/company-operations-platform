import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrations = resolve(root, 'supabase/migrations')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const compact = (sql: string) => sql.replace(/\s+/gu, ' ').trim().toLowerCase()

function migration(suffix: string) {
  const names = readdirSync(migrations).filter(name => name.endsWith(`_${suffix}.sql`))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(migrations, names[0]!), 'utf8')
}

const publicRpcSignatures = [
  'c1_material_list_projects(target_company_id uuid)',
  'c1_material_list_items(target_company_id uuid)',
  'c1_material_create_item(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)',
  'c1_material_update_item(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)',
  'c1_material_list_supplier_names(target_company_id uuid,target_id uuid)',
  'c1_material_record_supplier_name(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)',
  'c1_material_resolve_supplier(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)',
  'c1_material_list_proposals(target_company_id uuid,target_project_id uuid)',
  'c1_material_read_proposal(target_company_id uuid,target_project_id uuid,target_id uuid)',
  'c1_material_create_proposal(target_company_id uuid,target_project_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)',
  'c1_material_update_proposal(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)',
  'c1_material_submit_proposal(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)',
  'c1_material_decide_proposal(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)',
  'c1_material_create_order(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)',
  'c1_material_list_orders(target_company_id uuid,target_project_id uuid)',
  'c1_material_read_order(target_company_id uuid,target_project_id uuid,target_id uuid)',
] as const

describe('C1 material procurement forward-only contract', () => {
  it('pins scoped tables, immutable snapshots, exact decimals and the canonical contract association', () => {
    const sql = compact(migration('c1_material_procurement_foundation'))

    for (const table of [
      'material_items',
      'material_supplier_names',
      'material_proposals',
      'material_proposal_lines',
      'material_proposal_revisions',
      'material_proposal_revision_lines',
      'material_proposal_decisions',
      'material_orders',
      'material_order_allocations',
      'material_order_contracts',
      'material_evidence_scopes',
    ]) {
      expect(sql).toContain(`create table public.${table}`)
    }

    expect(sql).toContain('numeric(20,4)')
    expect(sql).toMatch(/foreign key \(project_id, tenant_id, company_id\) references public\.projects\(id, tenant_id, company_id\)/u)
    expect(sql).toMatch(/references public\.cost_workflow_contracts\(id, tenant_id, company_id, project_id\)/u)
    expect(sql).toContain('create trigger material_revision_history_immutable')
    expect(sql).not.toContain('create table public.material_payments')
    expect(sql).not.toContain('create table public.direct_contract_authorities')
  })

  it('pins RLS, denied direct writes and role-specific order/evidence reads', () => {
    const sql = compact(migration('c1_material_procurement_security'))

    for (const table of [
      'material_items',
      'material_supplier_names',
      'material_proposals',
      'material_proposal_lines',
      'material_proposal_revisions',
      'material_proposal_revision_lines',
      'material_proposal_decisions',
      'material_orders',
      'material_order_allocations',
      'material_order_contracts',
      'material_evidence_scopes',
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`alter table public.${table} force row level security`)
    }

    expect(sql).toContain('revoke all on')
    expect(sql).toMatch(/from public, ?anon, ?authenticated, ?service_role/u)
    expect(sql).toContain('grant select on')
    expect(sql).toContain("'material.order.manage'")
    expect(sql).toContain("'material.contract.record'")
    expect(sql).toContain("'cost.notification.read'")
    expect(sql).toContain('material_cost_evidence_financial_read')
    expect(sql).not.toMatch(/grant (insert|update|delete|all) on public\.material_/u)
  })

  it('freezes public RPC signatures, command receipts and deterministic allocation locks', () => {
    const sql = compact(migration('c1_material_procurement_commands'))

    for (const signature of publicRpcSignatures) {
      expect(sql).toContain(`create function public.${signature} returns jsonb`)
    }

    expect(sql).toContain("security definer set search_path=''")
    expect(sql).toContain('from public,anon,authenticated')
    expect(sql).toContain('to authenticated')
    expect(sql).toContain('public.cost_command_receipts')
    expect(sql).toContain('private.c1_workflow_receipt')
    expect(sql).toContain('private.c1_workflow_hash')
    expect(sql).toContain('signed_material_unit_immutable')
    expect(sql).toContain('returnreason')
    expect(sql).toMatch(/order by line\.id for update/u)
    expect(sql).toContain("quantity::text")
    expect(sql).toContain("unit_price::text")
    expect(sql).not.toContain('c1_material_record_contract')
  })

  it('keeps executable SQL assertions for permissions, revisions and allocation races', () => {
    const behavior = compact(read('supabase/tests/database/c1/c1_material_procurement.test.sql'))
    const security = compact(read('supabase/tests/database/c1/c1_material_procurement_security.test.sql'))

    for (const assertion of [
      '20 -> 10 + 10',
      '20 -> 11 + 10',
      'concurrent 11 + 11',
      'version_conflict',
      'signed quantity',
    ]) {
      expect(behavior).toContain(assertion)
    }

    expect(security).toContain('permission_denied')
    expect(security).toContain('buyer cannot update proposal')
    expect(security).toContain('engineer cannot read order financials')
    expect(security).toContain('direct table dml denied')
  })
  it('preserves the existing evidence-helper parameter identity while extending its body', () => {
    const security = compact(migration('c1_material_procurement_security'))
    const helper = security.slice(
      security.indexOf('create or replace function private.c1_workflow_can_read_file'),
      security.indexOf('revoke all on function private.c1_workflow_can_read_file'),
    )

    expect(helper).toMatch(/c1_workflow_can_read_file\(\s*t uuid,\s*c uuid,\s*p uuid,\s*file_id uuid\s*\)/u)
    expect(helper).not.toContain('target_tenant_id uuid')
    expect(helper).toContain("'cost.request.file.read'")
    expect(helper).toContain('material_evidence_scopes')
  })

  it('keeps supplier aliases out of engineer material.read access', () => {
    const security = compact(migration('c1_material_procurement_security'))
    const commands = compact(migration('c1_material_procurement_commands'))
    const policy = security.slice(
      security.indexOf('create policy material_supplier_names_read'),
      security.indexOf('create policy material_proposals_read'),
    )
    const listRpc = commands.slice(
      commands.indexOf('create function private.c1_material_list_supplier_names'),
      commands.indexOf('create function private.c1_material_record_supplier_name'),
    )

    for (const sql of [policy, listRpc]) {
      expect(sql).toContain("'material.supplier.record'")
      expect(sql).toContain("'material.contract.record'")
    }
    expect(policy).not.toContain("'material.read'")
    expect(listRpc).toContain('permission_denied')

    const runtime = compact(read('supabase/tests/database/c1/c1_material_procurement_security.test.sql'))
    expect(runtime).toContain('engineer supplier alias rls returns no rows')
    expect(runtime).toContain('engineer supplier alias rpc is denied')
  })

  it('guards returned edits and submission against every non-cancelled reservation', () => {
    const commands = compact(migration('c1_material_procurement_commands'))
    const update = commands.slice(
      commands.indexOf('create function private.c1_material_update_proposal'),
      commands.indexOf('create function private.c1_material_submit_proposal'),
    )
    const submit = commands.slice(
      commands.indexOf('create function private.c1_material_submit_proposal'),
      commands.indexOf('create function private.c1_material_decide_proposal'),
    )

    for (const sql of [update, submit]) {
      expect(sql).toContain("existing_order.state <> 'cancelled'")
      expect(sql).toContain('material_allocation_exceeded')
    }

    const runtime = compact(read('supabase/tests/database/c1/c1_material_procurement.test.sql'))
    expect(runtime).toContain('unsigned reserved quantity cannot be reduced')
    expect(runtime).toContain('reserved proposal line cannot be omitted')
    expect(runtime).toContain('submit rejects reduced reserved quantity')
    expect(runtime).toContain('submit rejects omitted reserved line')
  })
})
