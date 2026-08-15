import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const rlsTest = readFileSync(
  resolve(root, 'supabase/tests/database/tenancy_rls.test.sql'),
  'utf8',
)

describe('Cloud DEV pgTAP isolation', () => {
  it('creates all RLS fixtures before assuming the authenticated role', () => {
    const fixtureStart = rlsTest.indexOf('insert into auth.users')
    const authenticatedRole = rlsTest.indexOf('set local role authenticated')

    expect(rlsTest.trimStart().startsWith('begin;')).toBe(true)
    expect(fixtureStart).toBeGreaterThan(0)
    expect(fixtureStart).toBeLessThan(authenticatedRole)
    expect(rlsTest).toContain("'test-a'")
    expect(rlsTest).toContain("'test-b'")
  })

  it('does not depend on persistent VQH or isolation seed rows', () => {
    expect(rlsTest).not.toContain("array['vqh']")
    expect(rlsTest).not.toContain("array['ISO']")
    expect(rlsTest.trimEnd().endsWith('rollback;')).toBe(true)
  })
})
