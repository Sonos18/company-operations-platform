import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationPath = 'supabase/migrations/20261016090000_c1_material_small_order_contracts.sql'
const pgtapPath = 'supabase/tests/database/c1/c1_material_small_order_contracts.test.sql'
const normalize = (text: string) => text.replace(/\s+/gu, ' ').toLowerCase()
const read = (path: string) => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : '')
const sql = normalize(read(migrationPath))
const pgtap = read(pgtapPath)

// TODO(T6): import MATERIAL_SMALL_ORDER_THRESHOLD from shared/constants/material-finance.ts
// once Task 3 is merged, and compare against it instead of this literal.
const MATERIAL_SMALL_ORDER_THRESHOLD = '5000000'

function definitionOf(signature: string, created = false) {
  const start = sql.indexOf(`create ${created ? '' : 'or replace '}function ${signature}(`)
  expect(start, `${signature} is ${created ? 'created' : 'redefined'}`).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf(' $$;', sql.indexOf(' as $$', start))
  return sql.slice(start, end)
}

describe('material small order contracts migration', () => {
  it('small order contracts migration is forward-only and pinned', () => {
    expect(existsSync(resolve(root, migrationPath))).toBe(true)
    expect(sql).toContain('pg_advisory_xact_lock(71842, 57)')
    expect(sql.startsWith("set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, 57);")).toBe(true)
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
    expect(sql).toContain(MATERIAL_SMALL_ORDER_THRESHOLD)
    expect(definitionOf('private.c1_material_small_order_threshold', true))
      .toContain(`select ${MATERIAL_SMALL_ORDER_THRESHOLD}::numeric`)
    // No destructive statement at the top level. The only data delete is the copied
    // body of link_request_invoices, which replaces a request's own invoice links.
    const topLevel = sql.replace(/\$\$[\s\S]*?\$\$/gu, () => '$$ $$')
    expect(topLevel).not.toMatch(/\bdrop table\b|\btruncate\b|\bdelete from\b/u)
    expect(sql.match(/\bdelete from\b/gu) ?? []).toHaveLength(1)
    expect(definitionOf('private.c1_material_link_request_invoices', true))
      .toContain('delete from public.material_payment_request_invoices where payment_request_id = target_request.id;')
    expect(sql).toContain('create or replace function private.c1_material_record_contract(')
  })

  it('keeps every redefined function security definer with an empty search_path and private', () => {
    for (const signature of [
      'private.c1_material_record_contract',
      'private.c1_material_amend_contract',
      'private.c1_material_create_evidence_intent',
      'private.c1_material_create_payment_request',
      'private.c1_material_resubmit_payment_request',
      'private.c1_material_decide_payment_request',
      'private.c1_material_read_contract',
      'private.c1_material_order_json',
      'private.c1_material_finance_facts',
      'private.c1_material_notify_contract_saved',
      'private.c1_material_emit_installment_reminders',
      'private.c1_material_payment_payload',
    ]) {
      const body = definitionOf(signature)
      expect(body, signature).toContain('security definer')
      expect(body, signature).toContain("set search_path = ''")
    }
    expect(sql).not.toMatch(/grant execute on function private\./u)
  })

  it('adds the documentation column and the safety-net checks', () => {
    expect(sql).toContain("add column documentation text not null default 'contract'")
    expect(sql).toContain("check (documentation in ('contract', 'quotation_only'))")
    expect(sql).toContain('alter column contract_no drop not null')
    expect(sql).toContain("check ((documentation = 'contract') = (contract_no is not null))")
    expect(sql).toContain('alter column contract_file_id drop not null')
    expect(sql).toContain(`check (contract_file_id is not null or (kind = 'original' and vat_amount = 0 and total < ${MATERIAL_SMALL_ORDER_THRESHOLD}))`)
  })

  it('checks the threshold and the quotation MIME type in record_contract', () => {
    const record = definitionOf('private.c1_material_record_contract')
    expect(record).toContain("raise exception using errcode = 'p0001', message = 'contract_required'")
    expect(record).toContain('private.c1_material_is_small_amount(v_money.order_subtotal, v_order.currency_code)')
    expect(record).toContain('private.c1_material_is_small_amount(v_money.subtotal, v_order.currency_code)')
    expect(record).toContain("'thanh toán 100%'")
    expect(record).toContain("v_quotation_mime is distinct from 'application/pdf'")
    expect(definitionOf('private.c1_material_amend_contract')).toContain("message = 'contract_amendment_unavailable'")
  })

  it('routes every invoice requirement through the shared helper', () => {
    expect(sql).toContain('drop function private.c1_material_link_request_invoices(public.material_payment_requests, jsonb, boolean);')
    for (const signature of ['private.c1_material_create_payment_request', 'private.c1_material_resubmit_payment_request']) {
      expect(definitionOf(signature), signature)
        .toContain("private.c1_material_link_request_invoices(v_request, target_input->'invoiceids', private.c1_material_installment_requires_invoice(v_contract, v_installment))")
    }
    const decide = definitionOf('private.c1_material_decide_payment_request')
    expect(decide).toContain('private.c1_material_installment_requires_invoice(v_contract, private.c1_material_current_installment(v_contract, v_request.installment_key))')
    expect(decide).not.toContain(').is_advance')
    // Task 2 rewrites record_payment and the payment table.
    expect(sql).not.toContain('function private.c1_material_record_payment(')
    expect(sql).not.toContain('public.material_payments')
  })

  it('lets signed quotations upload as images while signed contracts stay PDF-only', () => {
    expect(sql).toContain("when 'signed_quotation' then target_mime in ('application/pdf','image/jpeg','image/png')")
    expect(definitionOf('private.c1_material_create_evidence_intent'))
      .toContain("v_role in ('unsigned_quotation','signed_contract') and coalesce(v_mime <> 'application/pdf', true)")
  })

  it('patches the proposal contractStatus through an anchor with a drift guard', () => {
    expect(sql).toContain("pg_get_functiondef('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)'::regprocedure)")
    expect(sql).toContain('v_anchor := replace(v_anchor, chr(13), \'\');')
    const patch = sql.slice(sql.indexOf('v_replacement text := $replacement$'), sql.indexOf('$replacement$;', sql.indexOf('v_replacement text := $replacement$')))
    expect(patch).toContain("'documentation', contract.documentation")
    expect(patch).not.toMatch(/total|subtotal|amount/u)
  })
})

describe('material small order contracts pgTAP', () => {
  it('declares a plan, rolls back and covers the review focus cases', () => {
    expect(pgtap).toMatch(/select plan\(\d+\);/u)
    expect(pgtap.trim().endsWith('rollback;')).toBe(true)
    for (const code of ['CONTRACT_REQUIRED', 'INPUT_INVALID', 'EVIDENCE_INVALID', 'CONTRACT_AMENDMENT_UNAVAILABLE', 'INVOICE_REQUIRED', '23514']) {
      expect(pgtap, code).toContain(`'${code}'`)
    }
    expect(pgtap).toContain('"subtotal":"4999999.9999"')
    expect(pgtap).toContain('"subtotal":"5000000.0000"')
  })
})
