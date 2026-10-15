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

  it('pages notifications with an opaque keyset cursor over (created_at, id)', () => {
    const start = sql.indexOf('create function private.c1_list_app_notifications(')
    const body = sql.slice(start, sql.indexOf('$$;', start))
    expect(body).toContain('target_cursor text')
    expect(body).toContain('(notification.created_at, notification.id) < (v_cursor_at, v_cursor_id)')
    expect(body).toContain('order by notification.created_at desc, notification.id desc')
    expect(body).toContain('limit target_limit + 1')
    expect(sql).toContain('public.c1_list_app_notifications(uuid,text,integer)')
  })

  it('counts only rows inserted by the reminder run and takes no runtime advisory lock', () => {
    const start = sql.indexOf('create function private.c1_material_emit_installment_reminders(')
    const body = sql.slice(start, sql.indexOf('$$;', start))
    expect(body).toContain('on conflict (recipient_id, dedupe_key) do nothing returning 1')
    expect(body).not.toContain('advisory')
    expect(sql.match(/pg_advisory_xact_lock/gu)).toHaveLength(1)
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
      'rows sharing one created_at are paged by id: last page of one and no next cursor',
      'a malformed notification cursor is rejected',
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
