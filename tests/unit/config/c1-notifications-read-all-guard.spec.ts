import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationPath = 'supabase/migrations/20261017100000_c1_notifications_read_all.sql'
const pgtapPath = 'supabase/tests/database/c1/c1_notifications_read_all.test.sql'
const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim().toLowerCase()
const read = (path: string) => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : '')

describe('C1 notification center: mark all notifications read', () => {
  const sql = normalize(read(migrationPath))
  const privateSignature = 'private.c1_mark_notifications_read_all(target_company_id uuid, target_material_up_to timestamptz, target_cost_up_to timestamptz)'
  const publicSignature = 'public.c1_mark_notifications_read_all(target_company_id uuid, target_material_up_to timestamptz, target_cost_up_to timestamptz)'

  it('is pinned to lock 63 with the standard header and footer', () => {
    expect(existsSync(resolve(root, migrationPath))).toBe(true)
    expect(sql.startsWith("set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, 63);")).toBe(true)
    expect(sql.endsWith("notify pgrst, 'reload schema';")).toBe(true)
    expect(sql).not.toMatch(/\btruncate\b/u)
    expect(sql).not.toMatch(/\bdelete from\b/u)
    expect(sql).not.toMatch(/\bdrop table\b/u)
  })

  it('adds the private command and a plain sql public wrapper without replacing anything', () => {
    expect(sql).toContain(`create function ${privateSignature} returns jsonb`)
    expect(sql).toContain(`create function ${publicSignature} returns jsonb language sql volatile security definer set search_path = ''`)
    expect(sql).toContain('select private.c1_mark_notifications_read_all(target_company_id, target_material_up_to, target_cost_up_to);')
    // Existing functions keep their bodies; this migration only adds.
    expect(sql).not.toContain('create or replace')
    expect(sql).not.toMatch(/\balter table\b/u)
    expect(sql).not.toMatch(/\bdrop function\b/u)
  })

  it('exposes only the wrapper, and only to signed-in users', () => {
    expect(sql).toContain('revoke all on function private.c1_mark_notifications_read_all(uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;')
    expect(sql).toContain('revoke all on function public.c1_mark_notifications_read_all(uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;')
    expect(sql).toContain('grant execute on function public.c1_mark_notifications_read_all(uuid, timestamptz, timestamptz) to authenticated;')
    expect(sql).not.toMatch(/grant execute on function private\./u)
    expect(sql).not.toMatch(/to (anon|service_role|public)\b/u)
  })

  it('requires an active member of the company and takes the tenant from the company', () => {
    expect(sql).toContain('from public.companies as company where company.id = target_company_id')
    expect(sql).toContain('membership.user_id = auth.uid() and membership.company_id = target_company_id and membership.is_active')
    expect(sql).toContain("raise exception using errcode = 'p0001', message = 'permission_denied'")
  })

  it('marks material notifications per source, permission and cutoff', () => {
    expect(sql).toContain("target_material_up_to is not null and private.c1_workflow_user_has_permission(v_tenant, target_company_id, auth.uid(), 'material.read')")
    expect(sql).toContain('update public.app_notifications as notification set read_at = now() where notification.recipient_id = auth.uid() and notification.company_id = target_company_id and notification.read_at is null and notification.created_at <= target_material_up_to;')
  })

  it('marks only delivered cost notifications', () => {
    expect(sql).toContain("target_cost_up_to is not null and private.c1_workflow_user_has_permission(v_tenant, target_company_id, auth.uid(), 'cost.notification.read')")
    expect(sql).toContain('update public.cost_workflow_notifications as notification set read_at = now() where notification.recipient_id = auth.uid() and notification.tenant_id = v_tenant and notification.company_id = target_company_id and notification.delivery_state = \'available\' and notification.read_at is null and notification.created_at <= target_cost_up_to;')
  })

  it('returns the row count of each branch', () => {
    expect(sql.match(/get diagnostics v_\w+ = row_count;/gu)).toHaveLength(2)
    expect(sql).toContain("return jsonb_build_object('material', v_material, 'cost', v_cost);")
  })

  it('has a rollback-only pgTAP file under the reserved c137 prefix', () => {
    const test = read(pgtapPath)
    expect(test.trim()).toMatch(/^begin;/u)
    expect(test.trim()).toMatch(/rollback;$/u)
    const ids = test.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu) ?? []
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(id.toLowerCase().startsWith('c137')).toBe(true)
    const planned = Number(test.match(/select plan\((\d+)\);/u)?.[1])
    const assertions = test.match(/^select (is|ok|throws_ok|lives_ok|is_empty)\(/gmu) ?? []
    expect(planned).toBe(assertions.length)
  })
})
