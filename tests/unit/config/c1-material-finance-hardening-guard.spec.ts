import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationPath = 'supabase/migrations/20261015090500_c1_material_finance_hardening.sql'
const pgtapPath = 'supabase/tests/database/c1/c1_material_finance_hardening.test.sql'
const normalize = (text: string) => text.replace(/\s+/gu, ' ').toLowerCase()
const read = (path: string) => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : '')
const sql = normalize(read(migrationPath))
const pgtap = read(pgtapPath)

function definitionOf(signature: string) {
  const start = sql.indexOf(`create or replace function ${signature}(`)
  expect(start, `${signature} is redefined`).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf(' $$;', sql.indexOf(' as $$', start))
  return sql.slice(start, end)
}

const readLock = "perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.read');"

describe('material finance hardening migration', () => {
  it('uses its reserved advisory lock, statement limits and reloads PostgREST', () => {
    expect(sql.startsWith("set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, 55);")).toBe(true)
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('keeps every redefined function security definer with an empty search_path', () => {
    for (const signature of [
      'private.c1_material_finance_command_start',
      'private.c1_material_record_contract',
      'private.c1_material_amend_contract',
      'private.c1_material_decide_payment_request',
      'private.c1_material_record_payment',
      'public.c1_material_evidence_read_target',
    ]) {
      const body = definitionOf(signature)
      expect(body, signature).toContain('security definer')
      expect(body, signature).toContain("set search_path = ''")
    }
  })

  it('A: requires material.read after the command permission in every A4/A5 write', () => {
    const start = definitionOf('private.c1_material_finance_command_start')
    const commandLock = start.indexOf('perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, target_permission);')
    expect(commandLock).toBeGreaterThan(0)
    expect(start.indexOf(readLock)).toBeGreaterThan(commandLock)
    for (const signature of ['private.c1_material_record_contract', 'private.c1_material_amend_contract']) {
      const body = definitionOf(signature)
      const commandPermission = body.indexOf("perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.contract.record');")
      expect(commandPermission, signature).toBeGreaterThan(0)
      expect(body.indexOf(readLock), signature).toBeGreaterThan(commandPermission)
      expect(body.indexOf(readLock), signature).toBeLessThan(body.indexOf('private.c1_workflow_receipt('))
    }
    expect(sql).not.toContain('function private.c1_material_context(')
  })

  it('C: drops the amount from the returned and paid notification payloads only', () => {
    expect(definitionOf('private.c1_material_decide_payment_request'))
      .toContain("(private.c1_material_payment_payload(v_contract, v_request.amount) - 'amount') || jsonb_build_object('reason', v_reason)")
    expect(definitionOf('private.c1_material_record_payment'))
      .toContain("private.c1_material_payment_payload(v_contract, v_request.amount) - 'amount', 'pr:' || v_request.id::text || ':paid'")
    expect(sql).not.toContain('function private.c1_material_payment_payload(')
  })

  it('D: answers an amendment replay with the receipt version', () => {
    const amend = definitionOf('private.c1_material_amend_contract')
    expect(amend).toContain('return private.c1_material_ack(v_contract.id, v_receipt.result_version, true);')
    expect(amend).not.toContain('return private.c1_material_ack(v_contract.id, v_contract.version, true);')
  })

  it('B: returns the declared MIME type from the evidence read target', () => {
    expect(definitionOf('public.c1_material_evidence_read_target')).toContain("'declaredmimetype', v_file.declared_mime_type")
  })

  it('B: lets the evidence bucket store octet-stream and no XML content type', () => {
    expect(sql).toContain("update storage.buckets set allowed_mime_types = ( select array_agg(distinct mime order by mime) from unnest(coalesce(allowed_mime_types, '{}') || array['application/octet-stream']) as mime where mime not in ('application/xml', 'text/xml') ) where id = 'c1-accounting-evidence';")
  })

  it('keeps the grants of the redefined functions', () => {
    expect(sql).toContain('revoke all on function public.c1_material_evidence_read_target(uuid,uuid,uuid) from public,anon,authenticated,service_role;')
    expect(sql).toContain('grant execute on function public.c1_material_evidence_read_target(uuid,uuid,uuid) to authenticated;')
    expect(sql).not.toMatch(/grant execute on function private\./u)
  })
})

describe('material finance hardening pgTAP', () => {
  it('declares a plan and rolls back', () => {
    expect(pgtap).toMatch(/select plan\(\d+\);/u)
    expect(pgtap.trim().endsWith('rollback;')).toBe(true)
  })

  it('covers every must-fix item with a labelled assertion', () => {
    for (const label of ['material.read:', 'notifications:', 'amend replay:', 'finance evidence:']) {
      expect(pgtap, label).toContain(label)
    }
    for (const command of [
      'c1_material_record_invoice', 'c1_material_void_invoice', 'c1_material_create_payment_request',
      'c1_material_resubmit_payment_request', 'c1_material_cancel_payment_request',
      'c1_material_decide_payment_request', 'c1_material_record_payment',
      'c1_material_record_contract', 'c1_material_amend_contract',
    ]) {
      expect(pgtap, command).toContain(`('${command}',`)
    }
  })
})
