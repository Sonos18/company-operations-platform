import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\s+/gu, ' ').toLowerCase()
const sql = read('supabase/migrations/20261015090400_c1_material_finance_evidence.sql')

function definitionOf(signature: string) {
  const start = sql.indexOf(`create or replace function ${signature}`)
  expect(start, `${signature} is redefined`).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('$$; ', sql.indexOf('$$', sql.indexOf('as $$', start)) + 2)
  return sql.slice(start, end)
}

describe('material finance evidence migration', () => {
  it('takes its reserved advisory lock and reloads PostgREST', () => {
    expect(sql).toContain('pg_advisory_xact_lock(71842, 54)')
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('does not re-add or replace the scope constraints owned by the finance foundation', () => {
    expect(sql).not.toContain('material_evidence_scopes_role_target_check')
    expect(sql).not.toContain('material_evidence_scopes_target_shape_check')
    expect(sql).not.toContain('add constraint')
    expect(sql).not.toContain('alter table public.material_evidence_scopes')
  })

  it('no longer forces application/pdf in the replaced evidence functions', () => {
    for (const signature of [
      'private.c1_material_create_evidence_intent(',
      'private.c1_finalize_material_evidence(',
    ]) {
      expect(definitionOf(signature)).not.toContain("is distinct from 'application/pdf'")
    }
    expect(sql).toContain("when 'invoice' then target_mime in ('application/pdf','application/xml','text/xml')")
    expect(sql).toContain("when 'payment_proof' then target_mime in ('application/pdf','image/jpeg','image/png')")
    expect(sql).toContain("btrim(target_input->>'originalfilename'), v_mime")
  })

  it('maps payment proofs to material.payment.execute and the other contract roles to material.contract.record', () => {
    expect(sql).toContain("when 'payment_proof' then 'material.payment.execute'")
    expect(sql).toContain("else 'material.contract.record'")
    expect(definitionOf('private.c1_material_evidence_finalization_target(')).toContain('c1_material_evidence_role_permission(v_scope.evidence_role)')
    expect(definitionOf('private.c1_finalize_material_evidence(')).toContain('c1_material_evidence_role_permission(v_scope.evidence_role)')
    expect(definitionOf('private.c1_material_can_upload_evidence(')).toContain('c1_material_evidence_role_permission(scope.evidence_role)')
  })

  it('keeps the legacy-gate intent markers that 20261009063331 injected into the intent function', () => {
    const intent = definitionOf('private.c1_material_create_evidence_intent(')
    expect(intent).toContain("perform set_config('taskovia.c1_material_evidence.intent', v_file_id::text, true);")
    expect(intent).toContain("perform set_config('taskovia.c1_material_evidence.intent', '', true);")
    expect(intent).toContain('contract_id, evidence_role, created_by')
  })

  it('makes finance-only roles unreadable without finance visibility, for every read path', () => {
    const helper = sql.slice(sql.indexOf('create function private.c1_material_can_read_evidence('))
    expect(helper).toContain("when 'unsigned_quotation' then private.c1_material_can_read_order(t, c, p)")
    expect(helper).toContain('else private.c1_material_can_read_finance(t, c)')

    const readTarget = definitionOf('public.c1_material_evidence_read_target(')
    expect(readTarget).toContain('private.c1_material_can_read_evidence(v_tenant_id, target_company_id, target_project_id, v_file.id)')

    // Storage SELECT goes c1_can_select_evidence_object -> c1_workflow_can_read_file.
    const workflowRead = definitionOf('private.c1_workflow_can_read_file(')
    expect(workflowRead).toContain('private.c1_material_can_read_evidence(t,c,p,file_id)')
    expect(workflowRead).not.toContain('private.c1_material_can_read_order(t,c,p)')

    expect(sql).toContain('alter policy material_evidence_scopes_financial_read on public.material_evidence_scopes')
    expect(sql).toContain('alter policy material_cost_evidence_financial_read on public.cost_evidence_files')
  })

  it('lets authenticated evaluate the read predicate used by RLS and keeps helpers private', () => {
    expect(sql).toContain('grant execute on function private.c1_material_can_read_evidence(uuid,uuid,uuid,uuid) to authenticated;')
    expect(sql).toContain('private.c1_material_evidence_role_permission(text), private.c1_material_evidence_mime_allowed(text,text)')
  })

  it('widens the evidence bucket for XML and image evidence', () => {
    expect(sql).toContain("update storage.buckets set allowed_mime_types")
    expect(sql).toContain("array['application/xml','text/xml','image/jpeg','image/png','application/pdf']")
    expect(sql).toContain("where id = 'c1-accounting-evidence'")
  })
})
