import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migration = readFileSync(resolve(root, 'supabase/migrations/20261008150648_c1_material_procurement_namespace_hardening.sql'), 'utf8')
const behavior = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_material_procurement.test.sql'), 'utf8')
const security = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_material_procurement_security.test.sql'), 'utf8')
const compact = (value: string) => value.replace(/\s+/gu, ' ').toLowerCase()

describe('T4 material namespace corrective migration', () => {
  it('keeps exact shared signatures and routes generic workflow reads through the material predicate', () => {
    const sql = compact(migration)
    const helper = sql.slice(sql.indexOf('create or replace function private.c1_workflow_can_read_file('), sql.indexOf('revoke all on function private.c1_workflow_can_read_file('))
    expect(helper).toContain('t uuid, c uuid, p uuid, file_id uuid')
    expect(helper).toContain('and not private.c1_material_evidence_file(evidence.id)')
    expect(helper).toContain('private.c1_material_can_read_order(t,c,p)')
    expect(sql).toContain('create or replace function private.c1_workflow_require_evidence(t uuid,c uuid,p uuid,ids uuid[])')
    expect(sql).toContain('and not private.c1_material_evidence_file(f.id)')
    expect(sql).toContain("v_text > '9223372036854775806'")
  })

  it('blocks the common generic finalizer before receipt replay or file mutation', () => {
    const sql = compact(migration)
    expect(sql).toContain('private.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid)')
    expect(sql).toContain('if private.c1_material_evidence_file(target_id) then raise exception')
    expect(sql).toContain("message=''permission_denied''")
    expect(sql).toContain('c1_finalize_namespace_function_drift')
  })

  it('leaves executable cases for the array, read target, Storage, generic finalizer and max version', () => {
    const cases = compact(security)
    for (const label of [
      'workflow basis rejects material evidence id',
      'material file in historical basis array still denies workflow read',
      'workflow read target rejects material evidence',
      'generic cost read target still rejects material evidence after array attachment',
      'workflow storage predicate rejects material evidence',
      'generic finalizer rejects ineligible material pending intent',
    ]) expect(cases).toContain(label)
    expect(compact(behavior)).toContain('max bigint finalizer replay is controlled input invalid')
  })
})
