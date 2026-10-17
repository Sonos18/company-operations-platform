import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationPath = 'supabase/migrations/20261017090000_c1_material_proposal_codes.sql'
const pgtapPath = 'supabase/tests/database/c1/c1_material_proposal_codes.test.sql'
const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim().toLowerCase()
const read = (path: string) => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : '')

// Each read function keeps its name and signature through a wrapper over the renamed core.
const readFunctions = [
  { name: 'c1_material_proposal_json', args: 'uuid, uuid, uuid, uuid', regArgs: 'uuid,uuid,uuid,uuid' },
  { name: 'c1_material_order_json', args: 'uuid, uuid, uuid, uuid', regArgs: 'uuid,uuid,uuid,uuid' },
  { name: 'c1_material_read_contract', args: 'uuid, uuid, uuid', regArgs: 'uuid,uuid,uuid' },
  { name: 'c1_material_finance_facts', args: 'uuid, uuid', regArgs: 'uuid,uuid' },
  { name: 'c1_material_finance_inbox_facts', args: 'uuid, uuid', regArgs: 'uuid,uuid' },
]

const helperSignatures = [
  'private.c1_material_name_summary(text[])',
  'private.c1_material_proposal_summary(uuid)',
  'private.c1_material_order_summary(uuid)',
  'private.c1_material_order_label(uuid)',
  'private.c1_material_with_order_codes(jsonb)',
  'private.c1_material_assign_proposal_no()',
  'private.c1_material_assign_order_seq()',
  'private.c1_material_guard_codes()',
]

describe('C1 material proposal numbers and order codes', () => {
  const sql = normalize(read(migrationPath))

  it('is pinned to lock 61 with the standard header and footer', () => {
    expect(existsSync(resolve(root, migrationPath))).toBe(true)
    expect(sql.startsWith("set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, 61);")).toBe(true)
    expect(sql.endsWith("notify pgrst, 'reload schema';")).toBe(true)
    expect(sql).not.toMatch(/\btruncate\b/u)
    expect(sql).not.toMatch(/\bdelete from\b/u)
    expect(sql).not.toMatch(/\bdrop table\b/u)
  })

  it('adds unique, positive numbers per project and per proposal', () => {
    expect(sql).toContain('alter table public.material_proposals add column proposal_no integer;')
    expect(sql).toContain('alter table public.material_orders add column order_seq integer;')
    expect(sql).toContain('check (proposal_no > 0)')
    expect(sql).toContain('check (order_seq > 0)')
    expect(sql).toContain('unique (project_id, proposal_no)')
    expect(sql).toContain('unique (proposal_id, order_seq)')
    expect(sql).toContain('alter column proposal_no set not null')
    expect(sql).toContain('alter column order_seq set not null')
  })

  it('backfills by creation order, cancelled orders included, without touching history or versions', () => {
    expect(sql).toContain('row_number() over (partition by proposal.project_id order by proposal.created_at, proposal.id)')
    expect(sql).toContain('row_number() over (partition by material_order.proposal_id order by material_order.created_at, material_order.id)')
    // No state filter in the order backfill: cancelled orders keep a number.
    const orderBackfill = sql.slice(sql.indexOf('update public.material_orders as'), sql.indexOf('alter table public.material_orders alter column order_seq set not null'))
    expect(orderBackfill).not.toContain('cancelled')
    expect(sql).not.toContain('update public.material_proposal_revisions')
    expect(sql).not.toContain('update public.material_proposal_revision_lines')
    expect(sql).not.toMatch(/\bversion = /u)
    expect(sql).not.toMatch(/\bupdated_at = /u)
    expect(sql).not.toMatch(/\bdisable trigger\b/u)
  })

  it('assigns numbers in before-insert triggers under a lock and keeps them immutable', () => {
    expect(sql).toContain('create trigger material_proposal_no_assign before insert on public.material_proposals')
    expect(sql).toContain('create trigger material_order_seq_assign before insert on public.material_orders')
    expect(sql).toContain('create trigger material_codes_immutable before update on public.material_proposals')
    expect(sql).toContain('create trigger material_codes_immutable before update on public.material_orders')
    // Proposals serialize on advisory key 71843 per project, not on the projects row,
    // so cost writes that share-lock the project never wait on proposal creation.
    const proposalTrigger = sql.slice(
      sql.indexOf('create function private.c1_material_assign_proposal_no()'),
      sql.indexOf('create trigger material_proposal_no_assign'),
    )
    expect(proposalTrigger).toContain('perform pg_catalog.pg_advisory_xact_lock(71843, pg_catalog.hashtext(new.project_id::text));')
    expect(proposalTrigger).not.toContain('from public.projects')
    expect(proposalTrigger).not.toContain('for no key update')
    // Orders still lock their proposal row.
    expect(sql.match(/for no key update;/gu) ?? []).toHaveLength(1)
    expect(sql).not.toMatch(/from public\.projects as project\s+where project\.id = new\.project_id/u)
    expect(sql).toContain("message = 'material_code_immutable'")
    // The immutability guard only exists after the backfill has run.
    const lastBackfill = sql.lastIndexOf('update public.material_')
    expect(lastBackfill).toBeGreaterThan(0)
    expect(sql.indexOf('create trigger material_codes_immutable')).toBeGreaterThan(lastBackfill)
  })

  it('renames the five read functions to _core and wraps them under the same signature', () => {
    for (const fn of readFunctions) {
      expect(sql).toContain(`alter function private.${fn.name}(${fn.args}) rename to ${fn.name}_core;`)
      const wrapperStart = sql.indexOf(`create function private.${fn.name}(`)
      expect(wrapperStart, fn.name).toBeGreaterThan(sql.indexOf(`rename to ${fn.name}_core;`))
      const wrapper = sql.slice(wrapperStart, sql.indexOf('$$;', wrapperStart))
      expect(wrapper, fn.name).toContain("security definer set search_path = ''")
      expect(wrapper, fn.name).toContain(`private.${fn.name}_core(`)
    }
  })

  it('keeps every new or wrapped private function revoked from all API roles', () => {
    const revoke = sql.slice(sql.lastIndexOf('revoke all on function'))
    for (const fn of readFunctions) expect(revoke).toContain(`private.${fn.name}(${fn.regArgs})`)
    for (const signature of helperSignatures) expect(revoke).toContain(signature)
    expect(revoke).toContain('from public, anon, authenticated, service_role;')
  })

  it('adds a rollback-only pgTAP file with the c135 prefix, registered in the runner', () => {
    const pgtap = read(pgtapPath)
    expect(pgtap).toMatch(/^begin;/u)
    expect(pgtap.replace(/\r\n?/gu, '\n').trim()).toMatch(/select \* from finish\(true\);\nrollback;$/u)
    const ids = [...pgtap.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu)].map(([id]) => id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every(id => id.startsWith('c135'))).toBe(true)
    expect(pgtap).toContain("'P0001','MATERIAL_CODE_IMMUTABLE'")
    for (const key of ['proposalNo', 'orderSeq', 'revisionNo', 'summary', 'projectName']) expect(pgtap).toContain(`'${key}'`)
    expect(read('scripts/run-c1-cloud-dev-tests.mjs')).toContain("'c1_material_proposal_codes.test.sql': 'c135'")
  })
})
