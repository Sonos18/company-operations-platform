import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationPath = 'supabase/migrations/20261017110000_c1_notifications_realtime.sql'
const pgtapPath = 'supabase/tests/database/c1/c1_notifications_realtime.test.sql'
const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim().toLowerCase()
const read = (path: string) => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : '')

describe('C1 notification realtime: publication and order creator name', () => {
  const sql = normalize(read(migrationPath))

  it('is pinned to lock 64 with the standard header and footer', () => {
    expect(existsSync(resolve(root, migrationPath))).toBe(true)
    expect(sql.startsWith("set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, 64);")).toBe(true)
    expect(sql.endsWith("notify pgrst, 'reload schema';")).toBe(true)
    expect(sql).not.toMatch(/\btruncate\b/u)
    expect(sql).not.toMatch(/\bdelete from\b/u)
    expect(sql).not.toMatch(/\bdrop table\b/u)
  })

  it('adds both notification tables to supabase_realtime, skipping tables already published', () => {
    expect(sql).toContain('do $$')
    expect(sql).toContain("if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then raise exception using errcode = 'p0001', message = 'realtime_publication_missing'; end if;")
    for (const table of ['app_notifications', 'cost_workflow_notifications']) {
      expect(sql).toContain(`'${table}'`)
    }
    expect(sql).toContain("from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table")
    expect(sql).toContain("execute format('alter publication supabase_realtime add table public.%i', v_table)")
    expect(sql).not.toMatch(/drop publication|create publication|alter publication supabase_realtime (set|drop)/u)
  })

  it('adds actorName to the order-created payload and keeps the rest of the function', () => {
    expect(sql).toContain('create or replace function private.c1_material_notify_order_created()')
    expect(sql).toContain("'actorname', private.c1_material_user_display_name(new.tenant_id, new.company_id, new.created_by)")
    expect(sql).toContain("jsonb_build_object( 'suppliername', v_supplier_name, 'actorname',")
    expect(sql).toContain("'material.contract.record', 'material.order.created', 'material_order', new.id, '/materials/' || new.project_id::text || '/orders/' || new.id::text,")
    expect(sql).toContain("|| private.c1_material_summary_payload(private.c1_material_order_summary(new.id)), 'order:' || new.id::text")
  })

  it('leaves the deferred constraint trigger untouched', () => {
    expect(sql).not.toMatch(/material_order_created_notify/u)
    expect(sql).not.toMatch(/\b(drop|create) (constraint )?trigger\b/u)
  })

  it('has a rollback-only pgTAP file under the reserved c138 prefix', () => {
    const test = read(pgtapPath)
    expect(test.trim()).toMatch(/^begin;/u)
    expect(test.trim()).toMatch(/rollback;$/u)
    const ids = test.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu) ?? []
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(id.toLowerCase().startsWith('c138')).toBe(true)
    const planned = Number(test.match(/select plan\((\d+)\);/u)?.[1])
    const assertions = test.match(/^select (is|ok|throws_ok|lives_ok|is_empty)\(/gmu) ?? []
    expect(planned).toBe(assertions.length)
  })
})
