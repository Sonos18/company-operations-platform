import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const sql = readFileSync(resolve(root, 'supabase/migrations/20261015090000_c1_material_finance_foundation.sql'), 'utf8')
  .replace(/\s+/gu, ' ').toLowerCase()

describe('material finance foundation migration', () => {
  it('takes its reserved advisory lock and reloads PostgREST', () => {
    expect(sql).toContain('pg_advisory_xact_lock(71842, 50)')
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
  it('forces RLS and revokes direct DML on every new table', () => {
    for (const table of [
      'material_contracts', 'material_contract_versions', 'material_contract_installments', 'material_invoices',
      'material_invoice_lines', 'material_payment_requests', 'material_payment_request_revisions',
      'material_payment_request_invoices', 'material_payment_decisions', 'material_payments', 'app_notifications',
    ]) {
      expect(sql).toContain(`alter table public.${table} force row level security`)
      expect(sql).toContain(`revoke all on public.${table} from public,anon,authenticated,service_role`)
    }
  })
  it('re-points material_order_contracts only when empty', () => {
    expect(sql).toContain('c1_material_order_contracts_not_empty')
    expect(sql).toContain('references public.material_contracts(id, tenant_id, company_id, project_id)')
  })
  it('scopes notifications to the recipient and dedupes', () => {
    expect(sql).toContain('using (recipient_id = auth.uid())')
    expect(sql).toContain('unique (recipient_id, dedupe_key)')
    expect(sql).toContain('on conflict (recipient_id, dedupe_key) do nothing')
  })
  it('extends evidence scopes to contract targets by replacing the baseline checks', () => {
    expect(sql).toContain('drop constraint material_evidence_scopes_target_kind_check')
    expect(sql).toContain('c1_material_evidence_scope_baseline_missing')
    expect(sql).toContain("target_kind = 'material_contract' and evidence_role in ('contract_amendment','invoice','payment_proof') and contract_id is not null")
  })
  it('keeps finance history rows immutable', () => {
    for (const table of [
      'material_contract_versions', 'material_contract_installments', 'material_invoice_lines',
      'material_payment_request_revisions', 'material_payment_decisions', 'material_payments',
    ]) {
      expect(sql).toContain(`before update or delete on public.${table} for each row execute function private.c1_material_retain_history()`)
    }
  })
  it('grants authenticated only the RLS predicate helpers', () => {
    const tail = sql.slice(sql.lastIndexOf('grant execute on function'))
    const grant = tail.slice(0, tail.indexOf(';'))
    expect(grant).toContain('to authenticated')
    expect(grant).toContain('private.c1_material_can_read_finance(uuid,uuid)')
    expect(grant).toContain('private.c1_material_can_see_contract_status(uuid,uuid,uuid,uuid)')
    expect(grant).not.toContain('notify')
    expect(grant).not.toContain('installment_usage')
  })
})
