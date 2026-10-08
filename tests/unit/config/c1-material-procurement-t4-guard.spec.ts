import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrations = resolve(root, 'supabase/migrations')
const compact = (sql: string) => sql.replace(/\s+/gu, ' ').trim().toLowerCase()
function migration(suffix: string) {
  const names = readdirSync(migrations).filter(name => name.endsWith('_' + suffix + '.sql'))
  expect(names).toHaveLength(1)
  return compact(readFileSync(resolve(migrations, names[0]!), 'utf8'))
}

describe('C1 material procurement T4 forward-only guards', () => {
  it('adds explicit PDF evidence roles without guessing old material order documents', () => {
    const sql = migration('c1_material_procurement_evidence')

    expect(sql).toContain('add column evidence_role text')
    expect(sql).toContain('material_evidence_role_backfill_required')
    expect(sql).toContain('alter column evidence_role set not null')
    expect(sql).toContain("target_kind = 'material_proposal' and evidence_role = 'unsigned_quotation'")
    expect(sql).toContain("target_kind = 'material_order' and evidence_role in ('signed_quotation','signed_contract')")
    expect(sql).not.toMatch(/update public\.material_evidence_scopes.*set evidence_role/u)

    for (const signature of [
      'c1_material_create_evidence_intent(target_company_id uuid,target_project_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)',
      'c1_material_evidence_finalization_target(target_company_id uuid,target_project_id uuid,target_id uuid)',
      'c1_finalize_material_evidence_server(target_actor_id uuid,target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)',
      'c1_material_evidence_read_target(target_company_id uuid,target_project_id uuid,target_id uuid)',
    ]) expect(sql).toContain('function public.' + signature)

    expect(sql).toContain("target_input->>'mimetype' is distinct from 'application/pdf'")
    expect(sql).toContain('evidence.created_by = auth.uid()')
    expect(sql).toContain('scope.created_by = auth.uid()')
    expect(sql).toContain('private.c1_material_evidence_file(evidence.id)')
    expect(sql).toContain('not private.c1_material_evidence_file(id)')
    expect(sql).toContain('private.c1_material_reject_generic_evidence_link')
    expect(sql).toContain('private.c1_material_evidence_file(target_id)')
    expect(sql).toContain('v_receipt.request_hash <> v_hash')
    expect(sql).toContain('v_verified_field_count not in (0,3)')
    expect(sql).toContain("jsonb_typeof(target_input->'evidencerole') is distinct from 'string'")
    expect(sql).toContain("jsonb_typeof(target_input#>'{target,kind}') is distinct from 'string'")
    expect(sql).toContain("v_text > '9223372036854775807'")
    expect(sql).toContain("grant execute on function public.c1_finalize_material_evidence_server(uuid,uuid,uuid,uuid,jsonb,uuid,uuid) to service_role")
    expect(sql).not.toMatch(/grant execute on function public\.c1_finalize_material_evidence_server\([^;]+to authenticated/u)
    expect(sql).toContain('private.c1_can_insert_evidence_object(target_bucket_id text,target_object_path text)')
    expect(sql).toContain('private.c1_can_select_evidence_object(target_bucket_id text,target_object_path text)')
    expect(sql).not.toContain('signedurl')

    const behavior = compact(readFileSync(resolve(root, 'supabase/tests/database/c1/c1_material_procurement.test.sql'), 'utf8'))
    expect(behavior).toContain('material evidence role must match proposal target')
    expect(behavior).toContain('material evidence accepts pdf only')
    expect(behavior).toContain('unfinished quotation evidence cannot create an order')
    expect(behavior).toContain('null evidence role is controlled input invalid')
    expect(behavior).toContain('out of range evidence size is controlled input invalid')
    expect(behavior).toContain('expected-version-only finalizer replay succeeds')
    expect(behavior).toContain('exact full verified finalizer replay succeeds')
    expect(behavior).toContain('changed full verified finalizer replay conflicts')
    expect(behavior).toContain('partial verified finalizer replay is input invalid')
    const security = compact(readFileSync(resolve(root, 'supabase/tests/database/c1/c1_material_procurement_security.test.sql'), 'utf8'))
    expect(security).toContain('generic cost.prepare cannot upload a material-scoped pending object')
    expect(security).toContain('generic cost.source.read cannot read finalized material metadata')
  })

  it('cancels unsigned orders once and keeps exact approved snapshot facts readable', () => {
    const sql = migration('c1_material_procurement_order_cancellation')

    expect(sql).toContain('create table public.material_order_cancellations')
    expect(sql).toContain('create function public.c1_material_cancel_order(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb')
    expect(sql).toContain("private.c1_material_context(target_company_id, 'material.order.manage')")
    expect(sql).toContain('order by line.id for update')
    expect(sql).toContain('for update of material_order')
    expect(sql).toContain('public.material_order_contracts')
    expect(sql).toContain("set state = 'cancelled'")
    expect(sql).toContain("'material.cancel_order'")
    expect(sql).toContain("'c1.material_order.cancelled'")
    expect(sql).toContain("'reason', v_reason")
    expect(sql).toContain("'orderstate', v_order.state")

    expect(sql).toContain('private.c1_material_guard_order_currency')
    expect(sql).toContain('settings.default_currency_code')
    expect(sql).toContain('settings.enabled')
    expect(sql).toContain('workflow_configuration_required')

    expect(sql).toContain('public.material_proposal_revision_lines as snapshot')
    expect(sql).toContain('snapshot.revision_id = v_order.approved_revision_id')
    for (const field of ['materialid', 'materialname', 'specification', 'unit', 'suppliername']) {
      expect(sql).toContain("'" + field + "'")
    }
    expect(sql).not.toContain("material_order.state <> 'cancelled'")

    const behavior = compact(readFileSync(resolve(root, 'supabase/tests/database/c1/c1_material_procurement.test.sql'), 'utf8'))
    expect(behavior).toContain('order currency must equal enabled company default currency')
    expect(behavior).toContain('unsigned cancellation retry replays without releasing twice')
    expect(behavior).toContain('signed order cancellation is denied')
    expect(behavior).toContain('old order keeps approved material name after resubmission and master rename')
  })
})
