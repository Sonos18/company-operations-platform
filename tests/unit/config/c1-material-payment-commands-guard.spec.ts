import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const sql = readFileSync(resolve(root, 'supabase/migrations/20261015090200_c1_material_payment_commands.sql'), 'utf8')
  .replace(/\s+/gu, ' ').toLowerCase()
const pgtap = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_material_payments.test.sql'), 'utf8')

function functionBody(name: string) {
  const start = sql.indexOf(`create function private.${name}(`)
  expect(start, `private.${name} is defined`).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('$$;', start)
  return sql.slice(start, end)
}

const commands = [
  'c1_material_record_invoice',
  'c1_material_void_invoice',
  'c1_material_create_payment_request',
  'c1_material_resubmit_payment_request',
  'c1_material_cancel_payment_request',
  'c1_material_decide_payment_request',
  'c1_material_record_payment',
]
const reads = ['c1_material_list_invoices', 'c1_material_list_payment_requests']

describe('material payment commands migration', () => {
  it('takes its reserved advisory lock and reloads PostgREST', () => {
    expect(sql).toContain('pg_advisory_xact_lock(71842, 52)')
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('raises every A5 business error code', () => {
    for (const code of [
      'installment_capacity_exceeded', 'invoice_required', 'self_decision_forbidden', 'proof_already_used',
      'invoice_in_use', 'installment_not_found', 'invoice_total_exceeded', 'invoice_duplicate',
      'invoice_total_mismatch', 'invoice_not_recorded', 'evidence_invalid', 'version_conflict', 'project_completed',
    ]) {
      expect(sql).toContain(`message = '${code}'`)
    }
  })

  it('serialises capacity on the contract row and counts only submitted or approved requests', () => {
    const lock = functionBody('c1_material_lock_contract')
    expect(lock).toContain('from public.material_contracts as contract')
    expect(lock).toContain('for update')
    const capacity = functionBody('c1_material_require_capacity')
    expect(capacity).toContain('from public.material_contracts as contract where contract.id = target_contract.id for update')
    expect(capacity).toContain("request.state in ('submitted','approved')")
    expect(capacity).toContain('request.id is distinct from excluding_request_id')
    expect(capacity).toContain('from public.material_payments as payment')
    expect(functionBody('c1_material_current_installment')).toContain('version_row.version_no = target_contract.current_version_no')
  })

  it('locks the contract before the payment request in every request command', () => {
    for (const name of ['c1_material_resubmit_payment_request', 'c1_material_cancel_payment_request', 'c1_material_decide_payment_request', 'c1_material_record_payment']) {
      const body = functionBody(name)
      const contractLock = body.indexOf('private.c1_material_lock_contract(')
      const requestLock = body.indexOf('private.c1_material_lock_payment_request(')
      const receipt = body.indexOf('private.c1_workflow_receipt(')
      expect(contractLock, name).toBeGreaterThan(0)
      expect(requestLock, name).toBeGreaterThan(contractLock)
      expect(receipt, name).toBeGreaterThan(requestLock)
    }
    const voidInvoice = functionBody('c1_material_void_invoice')
    expect(voidInvoice.indexOf('private.c1_material_lock_contract(')).toBeLessThan(voidInvoice.indexOf('from public.material_invoices as invoice where invoice.id = target_id and invoice.contract_id = v_contract.id for update'))
  })

  it('checks capacity when creating, resubmitting and paying', () => {
    expect(functionBody('c1_material_create_payment_request')).toContain('private.c1_material_require_capacity(v_contract, v_key, v_amount, null)')
    expect(functionBody('c1_material_resubmit_payment_request')).toContain('private.c1_material_require_capacity(v_contract, v_request.installment_key, v_amount, v_request.id)')
    expect(functionBody('c1_material_record_payment')).toContain('private.c1_material_require_capacity(v_contract, v_request.installment_key, v_request.amount, v_request.id)')
  })

  it('forbids the latest submitter from deciding or paying', () => {
    for (const name of ['c1_material_decide_payment_request', 'c1_material_record_payment']) {
      expect(functionBody(name)).toContain("if v_actor_id = v_request.submitted_by then raise exception using errcode = 'p0001', message = 'self_decision_forbidden'")
    }
    expect(functionBody('c1_material_resubmit_payment_request')).toContain('submitted_by = v_actor_id')
  })

  it('uses the T1 contract file helper without redefining it', () => {
    expect(sql).not.toContain('function private.c1_material_require_contract_file')
    expect(functionBody('c1_material_record_invoice')).toContain("private.c1_material_require_contract_file( v_tenant_id, target_company_id, target_project_id, private.c1_material_uuid(target_input->'fileid'), 'material_contract', 'invoice', null::uuid, v_contract.id)")
    expect(functionBody('c1_material_record_payment')).toContain("private.c1_material_require_contract_file( v_tenant_id, target_company_id, target_project_id, v_proof_file_id, 'material_contract', 'payment_proof', null::uuid, v_contract.id)")
  })

  it('links request invoices on the request contract', () => {
    expect(functionBody('c1_material_link_request_invoices')).toContain(
      'insert into public.material_payment_request_invoices(payment_request_id, invoice_id, tenant_id, company_id, project_id, contract_id)',
    )
  })

  it('records idempotency receipts per command', () => {
    for (const command of [
      'material.record_invoice', 'material.void_invoice', 'material.create_payment_request', 'material.resubmit_payment_request',
      'material.cancel_payment_request', 'material.decide_payment_request', 'material.record_payment',
    ]) {
      expect(sql.split(`'${command}'`).length - 1, command).toBe(2)
    }
  })

  it('grants execute only on the public wrappers', () => {
    const grant = sql.slice(sql.lastIndexOf('grant execute on function'))
    for (const name of [...commands, ...reads]) {
      expect(sql).toContain(`create function public.${name}(`)
      expect(grant).toContain(`public.${name}(`)
      expect(sql).toContain(`private.${name}(uuid,uuid,uuid`)
    }
    expect(grant).not.toContain('private.')
    expect(sql.match(/grant execute/gu)).toHaveLength(1)
  })

  it('reads require finance permission', () => {
    expect(functionBody('c1_material_require_finance_contract')).toContain('private.c1_material_can_read_finance(v_tenant_id, target_company_id)')
    for (const name of reads) {
      expect(functionBody(name)).toContain('private.c1_material_require_finance_contract(')
    }
  })
})

describe('material payment pgTAP coverage', () => {
  it('labels every Step 5 case', () => {
    for (const label of [
      'case 1: accountant records a 110 invoice',
      'case 1: invoice total exceeded',
      'case 1: duplicate supplier invoice identity',
      'case 1: invoice line outside the order',
      'case 1: supplier invoice name recorded once across repeated invoices',
      'case 2: advance request without invoice is submitted',
      'case 2: approvers Q and KQ are notified of the submission',
      'case 3: non-advance request requires an invoice',
      'case 3: non-advance request with a recorded invoice is submitted',
      'case 4: installment capacity exceeded',
      'case 5: concurrent create_payment_request for one installment',
      'case 6: requester cannot approve own request',
      'case 6: treasurer approves',
      'case 7: treasurer returns with reason',
      'case 7: returned notification to submitter with reason',
      'case 7: returned request leaves pending',
      'case 8: latest submitter is the resubmitter',
      'case 8: resubmitter cannot decide',
      'case 8: original creator may approve the resubmitted revision',
      'case 9: resubmit after amendment removed installment',
      'case 10: payment requires an approved request',
      'case 10: payer cannot be the submitter',
      'case 10: proof must be a payment_proof file of the contract',
      'case 10: payment recorded with the request amount',
      'case 10: paid notification to submitter',
      'case 11: proof hash already used by another file',
      'case 12: cancel approved request with reason',
      'case 12: paid request cannot be cancelled',
      'case 13: invoice in use by an active request cannot be voided',
      'case 13: invoice linked only to cancelled requests is voided',
      'case 14: create replay with the same key and payload',
      'case 14: create with the same key and another payload',
      'case 14: decide replay with the same key and payload',
      'case 14: decide with the same key and another payload',
      'case 14: record_payment replay with the same key and payload',
      'case 14: record_payment with the same key and another payload',
      'case 15: buyer denied',
      'case 15: buyer selects no material_payments rows',
      'case 16: fully paid installment rejects a new request',
    ]) {
      expect(pgtap).toContain(label)
    }
  })

  it('uses the c127 fixture prefix and marks the concurrency case for T8', () => {
    expect(pgtap).toContain('c1270000-0000-4000-8000-')
    expect(pgtap).toMatch(/select skip\('case 5: .*T8 runs the concurrency script', 1\);/u)
    expect(pgtap).not.toMatch(/\bdblink\s*\(/u)
  })
})
