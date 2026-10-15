import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const compact = (value: string) => value.replace(/\s+/gu, ' ').toLowerCase()
const migration = compact(readFileSync(resolve(root, 'supabase/migrations/20261015090100_c1_material_contract_commands.sql'), 'utf8'))
const behavior = compact(readFileSync(resolve(root, 'supabase/tests/database/c1/c1_material_contracts.test.sql'), 'utf8'))

function functionBody(name: string) {
  const marker = `create function ${name}(`
  const start = migration.indexOf(marker)
  expect(start, `${name} must be created`).toBeGreaterThan(-1)
  const next = migration.indexOf('create function ', start + marker.length)
  return migration.slice(start, next === -1 ? undefined : next)
}

describe('material contract commands migration', () => {
  it('takes its reserved advisory lock and reloads PostgREST', () => {
    expect(migration).toContain('pg_advisory_xact_lock(71842, 51)')
    expect(migration.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('records receipts and replays for both commands', () => {
    for (const command of ['material.record_contract', 'material.amend_contract']) {
      expect(migration).toContain(`private.c1_workflow_receipt(v_tenant_id, target_company_id, '${command}', target_idempotency_key, v_hash)`)
      expect(migration).toContain(`v_tenant_id, target_company_id, v_actor_id, '${command}', target_idempotency_key, v_hash`)
    }
  })

  it('raises the documented business errors', () => {
    for (const code of [
      'amendment_below_committed', 'variance_reason_required', 'order_not_active', 'contract_exists',
      'invoice_total_exceeded', 'installment_total_mismatch', 'contract_total_mismatch', 'evidence_invalid', 'version_conflict',
    ]) expect(migration).toContain(`message = '${code}'`)
  })

  it('flags the order as signed in material_order_contracts', () => {
    expect(migration).toContain('insert into public.material_order_contracts(order_id, tenant_id, company_id, project_id, contract_id, created_by)')
  })

  it('locks proposal lines in stable order before the order, as cancel does', () => {
    const record = functionBody('private.c1_material_record_contract')
    expect(record).toContain('order by line.id for update')
    expect(record.indexOf('from public.material_proposals as proposal')).toBeLessThan(record.indexOf('for update of material_order'))
  })

  it('keeps contract money out of buyer and engineer notifications', () => {
    const notify = functionBody('private.c1_material_notify_contract_saved')
    const permissionCall = notify.slice(notify.indexOf('c1_material_notify_permission('), notify.indexOf('c1_material_notify_users('))
    const usersCall = notify.slice(notify.indexOf('c1_material_notify_users('))
    expect(permissionCall).toContain("'material.finance.read'")
    expect(permissionCall).toContain("'total'")
    expect(usersCall).toContain('array[target_order.created_by, proposal_creator]')
    expect(usersCall).not.toContain("'total'")
    expect(notify).toContain("'contract:' || target_contract.id::text || ':v' || version_no::text")
  })

  it('checks the committed schedule and invoices before an amendment is applied', () => {
    const amend = functionBody('private.c1_material_amend_contract')
    expect(amend).toContain('private.c1_material_installment_usage(v_contract.id)')
    expect(amend).toContain('item.amount >= usage.paid + usage.pending')
    expect(amend).toContain("invoice.state = 'recorded'")
    expect(amend).toContain("'contract_amendment'")
  })

  it('replaces only the contract and cash fields of the order read', () => {
    expect(migration).toContain('create or replace function private.c1_material_order_json(')
    expect(migration).toContain("'total', case when private.c1_material_can_read_finance(contract.tenant_id, contract.company_id) then current_version.total::text else null end")
    expect(migration).not.toContain("'contract', null, 'cash', null")
  })

  it('grants execute only on the three public wrappers', () => {
    const grants = [...migration.matchAll(/grant execute on function (.*?) to authenticated;/gu)].map(match => match[1])
    expect(grants).toHaveLength(1)
    expect(grants[0]).toContain('public.c1_material_read_contract(uuid,uuid,uuid)')
    expect(grants[0]).toContain('public.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid)')
    expect(grants[0]).toContain('public.c1_material_amend_contract(uuid,uuid,uuid,jsonb,uuid,uuid)')
    expect(grants[0]).not.toContain('private.')
    for (const helper of [
      'private.c1_material_require_contract_file(uuid,uuid,uuid,uuid,text,text,uuid,uuid)',
      'private.c1_material_insert_installments(public.material_contracts,uuid,jsonb,numeric)',
      'private.c1_material_notify_contract_saved(public.material_contracts,public.material_orders,uuid,integer,numeric)',
      'private.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid)',
    ]) expect(migration).toContain(helper)
  })
})

describe('material contract pgTAP cases', () => {
  it('leaves an executable case for every acceptance item', () => {
    for (const label of [
      'case 1: accountant records a contract for an active order',
      'case 1: one contract with one original version is stored',
      'case 1: installments are stored in order with their amounts',
      'case 1: the order is flagged signed in material_order_contracts',
      'case 1: proposal shows signedquantity equal to the order quantity',
      'case 2: same key and payload replays without adding rows',
      'case 2: same key with a different payload is an idempotency conflict',
      'case 3: second contract for the same order is contract_exists',
      'case 4: cancelled order is order_not_active',
      'case 4: buyer cannot cancel an order that already has a contract',
      'case 5: subtotal different from order total needs a variance reason',
      'case 5: variance reason lets the contract be recorded',
      'case 6: contract file that is not finalized is evidence_invalid',
      'case 6: contract file scoped to another order is evidence_invalid',
      'case 6: contract file with the wrong evidence role is evidence_invalid',
      'case 6: contract file already attached to another version is evidence_invalid',
      'case 7: buyer cannot record a contract',
      'case 8: finance reader gets one notification carrying the total',
      'case 8: buyer gets one notification without a total',
      'case 8: engineer gets one notification without a total',
      'case 8: the acting accountant is not notified',
      'case 9: lowering an installment below what was paid is amendment_below_committed',
      'case 9: dropping an installment with a pending request is amendment_below_committed',
      'case 9: dropping an installment without payments succeeds',
      'case 9: a new total below the recorded invoices is invoice_total_exceeded',
      'case 10: a stale expectedversion is version_conflict',
      'case 10: amendment emits material.contract.amended with the versioned dedupe key',
      'case 11: accountant order read shows the contract total and committed cash',
      'case 11: buyer order read hides the contract total and cash',
      'case 11: order without a contract reads contract null',
    ]) expect(behavior, label).toContain(label)
  })
})
