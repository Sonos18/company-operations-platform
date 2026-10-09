import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrations = resolve(root, 'supabase/migrations')
const compact = (sql: string) => sql.replace(/\s+/gu, ' ').trim().toLowerCase()

function migration(suffix: string) {
  const names = readdirSync(migrations).filter(name => name.endsWith('_' + suffix + '.sql'))
  expect(names).toHaveLength(1)
  return compact(readFileSync(resolve(migrations, names[0]!), 'utf8'))
}

describe('C1 material engineer invoice name forward-only guard', () => {
  it('persists normalized engineer suggestions and patches only anchored material functions', () => {
    const sql = migration('c1_material_engineer_invoice_name')

    expect(sql).toContain('add column engineer_proposed_invoice_name text')
    expect(sql).toContain('char_length(engineer_proposed_invoice_name) <= 200')
    expect(sql).toContain("btrim(engineer_proposed_invoice_name) <> ''")
    for (const signature of [
      'private.c1_material_proposal_json(uuid,uuid,uuid,uuid)',
      'private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)',
      'private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
      'private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
    ]) expect(sql).toContain(signature)
    expect(sql.match(/pg_get_functiondef/gu) ?? []).toHaveLength(4)
    expect(sql).toContain("'engineerproposedinvoicename'")
    expect(sql).toContain("'effectiveinvoicedisplayname'")
    expect(sql).toContain("'invoicedisplaynamesource'")
    expect(sql).toContain("'buyeroverrideversion', 0")
  })

  it('keeps the c123 rollback source isolated and behavior-bearing', () => {
    const sql = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_material_engineer_invoice_name.test.sql'), 'utf8')

    expect(sql).toContain('select plan(10);')
    expect(sql).toContain('select * from finish(true);')
    expect([...sql.matchAll(/\b[0-9a-f]{4}0000-0000-4000-8000-000000000[0-9a-f]{3}\b/giu)].every(([id]) => id.startsWith('c123'))).toBe(true)
    for (const label of [
      'blank engineer suggestion falls back to canonical name',
      'explicit engineer suggestion is trimmed and returned',
      'submitted fallback remains frozen after catalog rename',
      'returned resubmission snapshots the new engineer suggestion',
      'overlength engineer suggestion is rejected',
      'peer engineer cannot change engineer invoice suggestion',
    ]) expect(sql).toContain(label)
  })
})
