import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const normalize = (text: string) => text.replace(/\s+/gu, ' ').toLowerCase()
const sql = normalize(readFileSync(resolve(root, 'supabase/migrations/20261015090600_c1_material_finance_access.sql'), 'utf8'))
const pgtap = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_material_finance_access.test.sql'), 'utf8')

function definitionOf(signature: string) {
  const start = sql.indexOf(`create or replace function ${signature}(`)
  expect(start, `${signature} is redefined`).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf(' $$;', sql.indexOf(' as $$', start))
  return sql.slice(start, end)
}

const invoiceRecheck = 'if not (private.c1_material_current_installment(v_contract, v_request.installment_key)).is_advance'

describe('material finance access migration', () => {
  it('uses its reserved advisory lock and reloads PostgREST', () => {
    expect(sql.startsWith("set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, 56);")).toBe(true)
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('keeps every redefined function security definer with an empty search_path', () => {
    for (const signature of [
      'private.c1_material_read_order', 'private.c1_material_list_orders', 'private.c1_material_notify_contract_saved',
      'private.c1_material_emit_installment_reminders', 'private.c1_material_cancel_payment_request',
      'private.c1_material_decide_payment_request', 'private.c1_material_record_payment',
    ]) {
      const body = definitionOf(signature)
      expect(body, signature).toContain('security definer')
      expect(body, signature).toMatch(/set search_path ?= ?''/u)
    }
    expect(sql).not.toMatch(/grant execute on function private\./u)
  })

  it('C1: lets finance readers read and list orders without touching c1_material_can_read_order', () => {
    for (const signature of ['private.c1_material_read_order', 'private.c1_material_list_orders']) {
      const body = definitionOf(signature)
      expect(body, signature).toContain('private.c1_material_can_read_order(v_tenant_id, target_company_id, target_project_id) or private.c1_material_can_read_finance(v_tenant_id, target_company_id)')
    }
    expect(sql).not.toContain('function private.c1_material_can_read_order(')
    expect(sql).not.toContain('function private.c1_material_order_json(')
  })

  it('I1: links the proposal creator to the proposal and adds a money-free contract status to the proposal JSON', () => {
    const notify = definitionOf('private.c1_material_notify_contract_saved')
    expect(notify).toContain("array[proposal_creator], v_event, 'material_contract', target_contract.id, '/materials/' || target_contract.project_id::text || '/proposals/' || target_order.proposal_id::text,")
    expect(notify).toContain("array[target_order.created_by], v_event, 'material_contract', target_contract.id, v_link,")
    expect(sql).toContain("pg_get_functiondef('private.c1_material_proposal_json(uuid,uuid,uuid,uuid)'::regprocedure)")
    const patch = sql.slice(sql.indexOf('v_replacement text := $replacement$'), sql.indexOf('$replacement$;', sql.indexOf('v_replacement text := $replacement$')))
    expect(patch).toContain("'contractstatus', coalesce((")
    expect(patch).toContain("'orderid', material_order.id, 'contractno', contract.contract_no, 'signedon', to_char(contract.signed_on, 'yyyy-mm-dd')")
    expect(patch).not.toMatch(/total|subtotal|amount/u)
  })

  it('M4: puts the contract id into the reminder dedupe key', () => {
    expect(definitionOf('private.c1_material_emit_installment_reminders'))
      .toContain("'inst:' || v_row.contract_id::text || ':' || v_row.installment_key::text || ':' || v_kind || ':' || v_row.due_on::text")
  })

  it('M6: requires material.payment.approve to cancel an approved request', () => {
    const cancel = definitionOf('private.c1_material_cancel_payment_request')
    expect(cancel).toContain("case when v_request.state = 'approved' then 'material.payment.approve' else 'material.payment.request' end")
    expect(cancel.indexOf("'material.payment.approve'")).toBeLessThan(cancel.indexOf('private.c1_workflow_receipt('))
  })

  it('M7: re-checks INVOICE_REQUIRED against the current installment when approving and paying', () => {
    const decide = definitionOf('private.c1_material_decide_payment_request')
    expect(decide).toContain(`if v_decision = 'approve' then -- an amendment may have turned an advance installment into a normal one`)
    expect(decide).toContain(invoiceRecheck)
    expect(definitionOf('private.c1_material_record_payment')).toContain(invoiceRecheck)
  })
})

describe('material finance access pgTAP', () => {
  it('declares a plan, rolls back and labels every item', () => {
    expect(pgtap).toMatch(/select plan\(16\);/u)
    expect(pgtap.trim().endsWith('rollback;')).toBe(true)
    for (const label of ['order access:', 'contract status:', 'reminders:', 'cancel:', 'invoice recheck:']) {
      expect(pgtap, label).toContain(label)
    }
  })
})
