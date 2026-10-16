import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const invoiceNameMigrationPath = 'supabase/migrations/20261016100000_c1_material_remove_proposal_invoice_names.sql'
const invoiceNamePgtapPath = 'supabase/tests/database/c1/c1_material_invoice_name_removal.test.sql'
const retiredPgtapPath = 'supabase/tests/database/c1/c1_material_engineer_invoice_name.test.sql'
const retiredGuardPath = 'tests/unit/config/c1-material-engineer-invoice-name-guard.spec.ts'
const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim().toLowerCase()
const read = (path: string) => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : '')

const proposalSignatures = [
  'private.c1_material_proposal_json(uuid,uuid,uuid,uuid)',
  'private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)',
  'private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
]

const removedProposalKeys = [
  'engineerProposedInvoiceName',
  'buyerProposedInvoiceName',
  'effectiveInvoiceDisplayName',
  'invoiceDisplayNameSource',
  'buyerOverrideVersion',
  'buyerInvoiceNameEditable',
]

describe('C1 material proposal invoice name removal', () => {
  const sql = normalize(read(invoiceNameMigrationPath))

  it('invoice name removal migration is pinned', () => {
    expect(existsSync(resolve(root, invoiceNameMigrationPath))).toBe(true)
    expect(sql).toContain('pg_advisory_xact_lock(71842, 59)')
    expect(sql.startsWith("set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, 59);")).toBe(true)
    expect(sql.endsWith("notify pgrst, 'reload schema';")).toBe(true)
    expect(sql).toContain('drop table public.material_proposal_invoice_name_overrides')
    expect(sql).toContain('drop function public.c1_material_set_proposal_invoice_name')
    expect(sql).not.toMatch(/\btruncate\b/u)
  })

  it('drops every engineer and buyer invoice name object', () => {
    expect(sql).toContain('drop function private.c1_material_set_proposal_invoice_name(uuid,uuid,uuid,uuid,jsonb,uuid,uuid)')
    expect(sql).toContain('drop function public.c1_material_set_proposal_invoice_name(uuid,uuid,uuid,uuid,jsonb,uuid,uuid)')
    expect(sql).toContain('drop function private.c1_material_engineer_invoice_name(jsonb)')
    for (const table of ['material_proposal_lines', 'material_proposal_revision_lines']) {
      expect(sql).toContain(`alter table public.${table} drop constraint ${table}_engineer_invoice_name_whitespace_check`)
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} drop constraint [a-z_]+, drop column engineer_proposed_invoice_name;`, 'u'))
    }
    // Only the C1 objects are dropped; no other table or column goes with them.
    expect(sql.match(/\bdrop table\b/gu) ?? []).toHaveLength(1)
    expect(sql.match(/\bdrop column\b/gu) ?? []).toHaveLength(2)
    expect(sql).not.toMatch(/\bdelete from\b/u)
  })

  it('patches the four proposal functions by anchor and keeps them private', () => {
    expect(sql.match(/pg_get_functiondef\(/gu) ?? []).toHaveLength(4)
    for (const signature of proposalSignatures) {
      expect(sql).toContain(`to_regprocedure('${signature}')`)
    }
    // CRLF checkouts must still match the LF bodies stored by Postgres.
    expect(sql.match(/chr\(13\)/gu)?.length ?? 0).toBeGreaterThanOrEqual(4)
    // The JSON patch removes only the name block; contractStatus and orderProgress stay untouched.
    expect(sql).not.toContain("'contractstatus', coalesce(")
    expect(sql).not.toContain("'orderprogress', jsonb_build_object(")
    expect(sql).toContain("'currentrevisionid'")
    const revoke = sql.slice(sql.lastIndexOf('revoke all on function'))
    for (const signature of proposalSignatures) expect(revoke).toContain(signature)
    expect(revoke).toContain('from public,anon,authenticated,service_role;')
  })

  it('adds a behavior-bearing pgTAP file and retires the engineer name suite', () => {
    const pgtap = read(invoiceNamePgtapPath)
    expect(pgtap).toMatch(/^begin;/u)
    expect(pgtap.replace(/\r\n?/gu, '\n').trim()).toMatch(/select \* from finish\(true\);\nrollback;$/u)
    expect([...pgtap.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu)].every(([id]) => id.startsWith('c123'))).toBe(true)
    expect(pgtap).toContain("hasnt_column('public','material_proposal_lines','engineer_proposed_invoice_name'")
    expect(pgtap).toContain("hasnt_column('public','material_proposal_revision_lines','engineer_proposed_invoice_name'")
    expect(pgtap).toContain("hasnt_table('public','material_proposal_invoice_name_overrides'")
    expect(pgtap).toContain("hasnt_function('public','c1_material_set_proposal_invoice_name'")
    expect(pgtap).toContain("hasnt_function('private','c1_material_set_proposal_invoice_name'")
    expect(pgtap).toContain("hasnt_function('private','c1_material_engineer_invoice_name'")
    expect(pgtap.match(/'P0001','INPUT_INVALID'/gu) ?? []).toHaveLength(2)
    for (const key of removedProposalKeys) expect(pgtap).toContain(`'${key}'`)
    expect(pgtap).toContain("? 'currentRevisionId'")
    expect(pgtap).toContain("? 'contractStatus'")

    expect(existsSync(resolve(root, retiredPgtapPath))).toBe(false)
    expect(existsSync(resolve(root, retiredGuardPath))).toBe(false)
    const runner = read('scripts/run-c1-cloud-dev-tests.mjs')
    expect(runner).not.toContain('c1_material_engineer_invoice_name.test.sql')
    expect(runner).toContain("'c1_material_invoice_name_removal.test.sql': 'c123'")
  })
})
