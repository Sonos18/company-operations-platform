import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MATERIAL_SMALL_ORDER_THRESHOLD } from '../../../shared/constants/material-finance'

const root = resolve(import.meta.dirname, '../../..')
const migrationPath = 'supabase/migrations/20261016100100_c1_material_finance_flow_adjustments.sql'
const pgtapPath = 'supabase/tests/database/c1/c1_material_flow_adjustments.test.sql'
const normalize = (text: string) => text.replace(/\s+/gu, ' ').toLowerCase()
const read = (path: string) => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : '')
const sql = normalize(read(migrationPath))
const pgtap = read(pgtapPath)

function definitionOf(signature: string, created = false) {
  const start = sql.indexOf(`create ${created ? '' : 'or replace '}function ${signature}(`)
  expect(start, `${signature} is ${created ? 'created' : 'redefined'}`).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf(' $$;', sql.indexOf(' as $$', start))
  return sql.slice(start, end)
}

describe('material finance flow adjustment migration', () => {
  it('finance flow adjustment migration is pinned', () => {
    expect(existsSync(resolve(root, migrationPath))).toBe(true)
    expect(sql).toContain('pg_advisory_xact_lock(71842, 60)')
    expect(sql.startsWith("set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, 60);")).toBe(true)
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
    expect(sql).toContain('create or replace function private.c1_material_record_payment')
    expect(sql).toContain("'material.payment.approved'")
    // Forward-only: no destructive statement at the top level.
    const topLevel = sql.replace(/\$\$[\s\S]*?\$\$/gu, () => '$$ $$')
    expect(topLevel).not.toMatch(/\bdrop table\b|\btruncate\b|\bdelete from\b|\bdrop function\b|\bdrop column\b/u)
  })

  it('keeps every rewritten function security definer, with an empty search_path and private', () => {
    for (const signature of [
      'private.c1_material_record_contract',
      'private.c1_material_require_contract_file',
      'private.c1_material_record_invoice',
      'private.c1_material_list_invoices',
      'private.c1_material_decide_payment_request',
      'private.c1_material_record_payment',
      'private.c1_material_finance_facts',
      'private.c1_material_read_contract',
    ]) {
      const body = definitionOf(signature)
      expect(body, signature).toContain('security definer')
      expect(body, signature).toContain("set search_path = ''")
    }
    for (const signature of ['private.c1_material_installment_requires_invoice', 'private.c1_material_evidence_mime_allowed']) {
      expect(definitionOf(signature), signature).toContain("set search_path = ''")
    }
    expect(sql).not.toMatch(/grant execute on function private\./u)
    expect(sql).toContain('private.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid)')
  })

  it('lets a record without a contract carry VAT below the threshold (C2)', () => {
    expect(sql).toContain('drop constraint material_contract_versions_contract_file_check')
    expect(sql).toContain(`check (contract_file_id is not null or (kind = 'original' and total < ${MATERIAL_SMALL_ORDER_THRESHOLD}))`)
    const record = definitionOf('private.c1_material_record_contract')
    expect(record).toContain("array['documentation','expectedorderversion','signedon','subtotal','vatamount','total','variancereason','signedquotationfileid']")
    expect(record).toContain('private.c1_material_is_small_amount(v_money.order_subtotal, v_order.currency_code)')
    expect(record).toContain('private.c1_material_is_small_amount(v_money.total, v_order.currency_code)')
    expect(record).toContain("message = 'contract_required'")
    expect(record).toContain("'thanh toán 100%'")
    expect(definitionOf('private.c1_material_installment_requires_invoice'))
      .toContain('select coalesce(not target_installment.is_advance, true)')
  })

  it('adds draft and official invoice stages on the same row (C3)', () => {
    expect(sql).toContain("add column stage text not null default 'official'")
    expect(sql).toContain("check (stage in ('draft', 'official'))")
    expect(sql).toContain('add column official_file_id uuid')
    expect(sql).toContain('constraint material_invoices_official_file_id_key unique,')
    expect(sql).toContain('foreign key (official_file_id, tenant_id, company_id, project_id) references public.cost_evidence_files(id, tenant_id, company_id, project_id)')
    expect(sql).toContain("(stage = 'draft' and official_file_id is null and officialized_by is null and officialized_at is null)")
    expect(sql).toContain("(stage = 'official' and official_file_id is null and officialized_by is null and officialized_at is null)")
    expect(sql).toContain("(stage = 'official' and official_file_id is not null and officialized_by is not null and officialized_at is not null)")

    expect(definitionOf('private.c1_material_require_contract_file'))
      .toContain('invoice.official_file_id = c1_material_require_contract_file.file_id')
    expect(definitionOf('private.c1_material_evidence_mime_allowed'))
      .toContain("when 'invoice' then target_mime in ('application/pdf','application/xml','text/xml','image/jpeg','image/png')")

    const record = definitionOf('private.c1_material_record_invoice')
    expect(record).toContain("coalesce(target_input->>'stage', 'official')")
    expect(record).toContain("v_stage not in ('draft','official')")

    const list = definitionOf('private.c1_material_list_invoices')
    expect(list).toContain("'stage', invoice.stage")
    expect(list).toContain("'officialfileid', invoice.official_file_id")
    expect(list).toContain("'officializedat', to_jsonb(invoice.officialized_at)")

    expect(definitionOf('private.c1_material_finance_facts')).toContain("'draftinvoiced'")
    expect(definitionOf('private.c1_material_read_contract'))
      .toContain("'draftinvoiced', coalesce(( select sum(invoice.total) from public.material_invoices as invoice where invoice.contract_id = v_contract.id and invoice.state = 'recorded' and invoice.stage = 'draft'), 0)::numeric(20,4)::text")
    expect(sql).toContain('private.c1_material_read_contract(uuid,uuid,uuid)')
  })

  it('adds the officialize command with a receipt, an audit row and an authenticated-only wrapper (C3)', () => {
    const body = definitionOf('private.c1_material_officialize_invoice', true)
    expect(body).toContain('security definer')
    expect(body).toContain("set search_path = ''")
    expect(body).toContain("'material.contract.record'")
    expect(body).toContain("array['expectedversion','officialfileid'], array['expectedversion','officialfileid']")
    expect(body).toContain("'material.officialize_invoice'")
    expect(body).toContain("'c1.material_invoice.officialized'")
    expect(body).toContain("v_invoice.state <> 'recorded' or v_invoice.stage <> 'draft'")
    expect(body).toContain("'material_contract', 'invoice', null::uuid, v_contract.id")
    expect(body).not.toContain('notify')

    const wrapper = definitionOf('public.c1_material_officialize_invoice', true)
    expect(wrapper).toContain('security definer')
    expect(wrapper).toContain('select private.c1_material_officialize_invoice(')
    expect(sql).toContain('revoke all on function public.c1_material_officialize_invoice(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;')
    expect(sql).toContain('grant execute on function public.c1_material_officialize_invoice(uuid,uuid,uuid,jsonb,uuid,uuid) to authenticated;')
    expect(sql).toContain('private.c1_material_officialize_invoice(uuid,uuid,uuid,jsonb,uuid,uuid)')
  })

  it('moves the payment step to the accountant and notifies the other side (C4)', () => {
    const payment = definitionOf('private.c1_material_record_payment')
    expect(payment).not.toContain('self_decision_forbidden')
    expect(payment).toContain("decision.decision = 'approve'")
    expect(payment).toContain('array[v_approver]')
    expect(payment).toContain("'material.payment.paid'")

    const decide = definitionOf('private.c1_material_decide_payment_request')
    expect(decide).toContain("message = 'self_decision_forbidden'")
    expect(decide).toContain("'material.payment.approved'")
    expect(decide).toContain("private.c1_material_payment_payload(v_contract, v_request.amount) - 'amount'")

    expect(sql).toContain('drop constraint app_notifications_event_kind_check')
    expect(sql).toContain("'material.payment.submitted','material.payment.returned','material.payment.paid','material.payment.approved'")
  })
})

describe('material finance flow adjustment pgTAP', () => {
  it('declares a plan that matches its assertions and rolls back', () => {
    expect(pgtap).toMatch(/select plan\(\d+\);/u)
    expect(pgtap.trim().endsWith('rollback;')).toBe(true)
    const planned = Number(/select plan\((\d+)\);/u.exec(pgtap)?.[1])
    const asserted = pgtap.match(/^select (?:is|ok|throws_ok|lives_ok)\(/gmu)?.length
    expect(planned).toBe(asserted)
  })

  it('covers the C2-C4 review focus cases', () => {
    for (const code of ['CONTRACT_REQUIRED', 'CONTRACT_TOTAL_MISMATCH', 'INVOICE_REQUIRED', 'VERSION_CONFLICT', 'EVIDENCE_INVALID', 'SELF_DECISION_FORBIDDEN']) {
      expect(pgtap, code).toContain(`'${code}'`)
    }
    expect(pgtap).toContain('"vatAmount":"300000"')
    expect(pgtap).toContain('"subtotal":"4800000"')
    expect(pgtap).toContain('"stage":"draft"')
    expect(pgtap).toContain('image/jpeg')
    expect(pgtap).toContain('material.payment.approved')
    expect(pgtap).toContain('draftInvoiced')
    expect(pgtap).toContain('public.c1_material_officialize_invoice(')
    expect(pgtap).toContain('public.c1_material_read_contract(')
  })
})
