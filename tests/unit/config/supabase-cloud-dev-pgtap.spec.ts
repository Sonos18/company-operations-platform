import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const rlsTest = readFileSync(
  resolve(root, 'supabase/tests/database/tenancy_rls.test.sql'),
  'utf8',
)

const authenticatedRole = rlsTest.indexOf('set local role authenticated')
const fixtureStatements = [
  'insert into auth.users (id, email) values',
  'insert into public.tenants (id, code, name) values',
  'insert into public.companies (id, tenant_id, code, name) values',
  'insert into public.tenant_memberships (user_id, tenant_id, roles) values',
  'insert into public.company_memberships (user_id, tenant_id, company_id, roles) values',
]
const fixtureSection = rlsTest.slice(rlsTest.indexOf('select plan(8);'), authenticatedRole)
const testAClaim = `select set_config(
  'request.jwt.claims',
  '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);`
const testBClaim = `select set_config(
  'request.jwt.claims',
  '{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);`
const testAAssertions = rlsTest.slice(
  rlsTest.indexOf(testAClaim),
  rlsTest.indexOf(testBClaim),
)
const testBAssertions = rlsTest.slice(
  rlsTest.indexOf(testBClaim),
  rlsTest.indexOf('select * from finish();'),
)

describe('Cloud DEV pgTAP isolation', () => {
  it('creates every RLS fixture in dependency order before assuming the authenticated role', () => {
    const fixturePositions = fixtureStatements.map((statement) =>
      rlsTest.indexOf(statement),
    )

    expect(rlsTest.trimStart().startsWith('begin;')).toBe(true)
    expect(fixturePositions).toEqual([...fixturePositions].sort((a, b) => a - b))
    for (const fixturePosition of fixturePositions) {
      expect(fixturePosition).toBeGreaterThan(rlsTest.indexOf('select plan(8);'))
      expect(fixturePosition).toBeLessThan(authenticatedRole)
    }

    expect(fixtureSection).toContain(
      "('31000000-0000-4000-8000-000000000001', 'test-a@rls.invalid')",
    )
    expect(fixtureSection).toContain(
      "('32000000-0000-4000-8000-000000000001', 'test-b@rls.invalid')",
    )
    expect(fixtureSection).toContain(
      "('31000000-0000-4000-8000-000000000010', 'test-a', 'RLS tenant A')",
    )
    expect(fixtureSection).toContain(
      "('32000000-0000-4000-8000-000000000010', 'test-b', 'RLS tenant B')",
    )
    expect(fixtureSection).toContain(
      "('31000000-0000-4000-8000-000000000020', '31000000-0000-4000-8000-000000000010', 'TEST-A', 'RLS company A')",
    )
    expect(fixtureSection).toContain(
      "('32000000-0000-4000-8000-000000000020', '32000000-0000-4000-8000-000000000010', 'TEST-B', 'RLS company B')",
    )
    expect(fixtureSection).toContain(
      "('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000010', array['tenant_admin'])",
    )
    expect(fixtureSection).toContain(
      "('32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000010', array['tenant_admin'])",
    )
    expect(fixtureSection).toContain(
      "('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000010', '31000000-0000-4000-8000-000000000020', array['director'])",
    )
    expect(fixtureSection).toContain(
      "('32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000010', '32000000-0000-4000-8000-000000000020', array['director'])",
    )
  })

  it('binds RLS assertions to the transaction-scoped fixture identities', () => {
    expect(testAAssertions).toContain(testAClaim)
    expect(testAAssertions).toContain(
      `select results_eq(
  'select code from public.tenants order by code',
  array['test-a']::text[],
  'test A user sees only the test A tenant'
);`,
    )
    expect(testAAssertions).toContain(
      `select results_eq(
  'select code from public.companies order by code',
  array['TEST-A']::text[],
  'test A user sees only the test A company'
);`,
    )
    expect(testAAssertions).toContain(
      `select results_eq(
  'select tenant_id::text from public.tenant_memberships',
  array['31000000-0000-4000-8000-000000000010']::text[],
  'test A user sees only their tenant membership'
);`,
    )
    expect(testAAssertions).toContain(
      `select results_eq(
  'select company_id::text from public.company_memberships',
  array['31000000-0000-4000-8000-000000000020']::text[],
  'test A user sees only their company membership'
);`,
    )
    expect(testAAssertions).toContain(
      `select is_empty(
  'select id from public.companies where id = ''32000000-0000-4000-8000-000000000020''',
  'test A user cannot infer the test B company'
);`,
    )
    expect(testAAssertions).toContain(
      `select throws_ok(
  'insert into public.companies (id, tenant_id, code, name) values (''31000000-0000-4000-8000-000000000099'', ''31000000-0000-4000-8000-000000000010'', ''NOPE'', ''Direct insert'')',
  '42501',
  'permission denied for table companies',
  'authenticated users cannot write tenancy tables directly'
);`,
    )
    expect(testBAssertions).toContain(testBClaim)
    expect(testBAssertions).toContain(
      `select results_eq(
  'select code from public.companies order by code',
  array['TEST-B']::text[],
  'test B user sees only the test B company'
);`,
    )
    expect(testBAssertions).toContain(
      `select is_empty(
  'select id from public.companies where id = ''31000000-0000-4000-8000-000000000020''',
  'test B user cannot infer the test A company'
);`,
    )
  })

  it('does not depend on persistent VQH or isolation seed rows', () => {
    expect(rlsTest).not.toContain("array['vqh']")
    expect(rlsTest).not.toContain("array['ISO']")
    expect(rlsTest).not.toMatch(
      /\b(?:10000000|20000000)-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
    )
    expect(rlsTest.trimEnd().endsWith('rollback;')).toBe(true)
  })
})
