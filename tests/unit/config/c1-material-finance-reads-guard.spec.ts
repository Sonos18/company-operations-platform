import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const squash = (value: string) => value.replace(/\s+/gu, ' ').toLowerCase()
const sql = squash(readFileSync(resolve(root, 'supabase/migrations/20261015090300_c1_material_finance_reads.sql'), 'utf8'))
const pgtap = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_material_finance_reads.test.sql'), 'utf8')

describe('material finance reads migration', () => {
  it('takes its reserved advisory lock and reloads PostgREST', () => {
    expect(sql).toContain('pg_advisory_xact_lock(71842, 53)')
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('grants the reminder emitter to service_role only', () => {
    expect(sql).toContain('grant execute on function public.c1_material_emit_installment_reminders(date) to service_role')
    const authenticatedGrants = [...sql.matchAll(/grant execute on function ([^;]*?) to authenticated;/gu)].map(match => match[1])
    expect(authenticatedGrants.length).toBeGreaterThan(0)
    for (const grant of authenticatedGrants) expect(grant).not.toContain('c1_material_emit_installment_reminders')
    expect(sql).toMatch(/revoke all on function[^;]*public\.c1_material_emit_installment_reminders\(date\)[^;]*from public,anon,authenticated,service_role;/u)
  })

  it('scopes notification list and read to the signed-in recipient', () => {
    for (const name of ['c1_list_app_notifications', 'c1_read_app_notification']) {
      const body = sql.slice(sql.indexOf(`create function private.${name}(`), sql.indexOf('$$;', sql.indexOf(`create function private.${name}(`)))
      expect(body).toContain('recipient_id = auth.uid()')
    }
  })

  it('does not use auth.uid() in the reminder emitter', () => {
    const start = sql.indexOf('create function private.c1_material_emit_installment_reminders(')
    const body = sql.slice(start, sql.indexOf('$$;', start))
    expect(body).not.toContain('auth.uid()')
    expect(body).toContain("'material.contract.record'")
  })

  it('filters inbox lists by the matching permission', () => {
    for (const permission of ['material.contract.record', 'material.payment.request', 'material.payment.approve', 'material.payment.execute']) {
      expect(sql).toContain(`c1_material_actor_has_permission(v_tenant_id, target_company_id, '${permission}')`)
    }
  })
})

describe('material finance reads pgTAP', () => {
  it('covers the planned cases', () => {
    for (const label of [
      'finance facts only return contracts of the actor company',
      'paid counts payments and pending counts submitted plus approved requests',
      'procurement inbox is denied without finance permissions',
      'treasurer inbox has no awaiting contracts',
      'user B does not see notifications of user A',
      'a page never splits rows that share one created_at',
      'reading twice is idempotent',
      'authenticated cannot call the reminder emitter',
      'a second run on the same day creates no new reminders',
      'a moved due date creates new reminders while unchanged ones stay deduplicated',
    ]) {
      expect(pgtap).toContain(label)
    }
  })

  it('declares a plan that matches the assertion count', () => {
    const planned = Number(/select plan\((\d+)\);/u.exec(pgtap)?.[1])
    const asserted = pgtap.match(/^select (?:is|ok|throws_ok|lives_ok|isnt)\(/gmu)?.length
    expect(planned).toBe(asserted)
  })
})
