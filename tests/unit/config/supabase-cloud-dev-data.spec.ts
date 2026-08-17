import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationsDir = resolve(root, 'supabase/migrations')

describe('Cloud DEV VQH bootstrap migration', () => {
  it('contains only idempotent VQH tenant and company data', () => {
    const filenames = readdirSync(migrationsDir)
      .filter(name => name.endsWith('_bootstrap_vqh_tenant.sql'))

    expect(filenames).toHaveLength(1)
    const sql = readFileSync(resolve(migrationsDir, filenames[0]!), 'utf8')

    expect(sql).toContain("'10000000-0000-4000-8000-000000000010', 'vqh'")
    expect(sql).toContain("'10000000-0000-4000-8000-000000000020'")
    expect(sql).toMatch(/'10000000-0000-4000-8000-000000000010',\s*'VQH'/)
    expect(sql.match(/on conflict do nothing/g)).toHaveLength(2)
    expect(sql).not.toMatch(/auth\.users|tenant_memberships|company_memberships/i)
    expect(sql).not.toMatch(/isolation|\.local/i)
  })

  it('uses one forward migration to fail closed and canonicalize VQH data', () => {
    const filenames = readdirSync(migrationsDir)
      .filter(name => name.endsWith('_reconcile_vqh_canonical_data.sql'))

    expect(filenames).toHaveLength(1)
    const sql = readFileSync(resolve(migrationsDir, filenames[0]!), 'utf8')

    expect(sql).toContain("raise exception 'VQH tenant ID conflicts with the canonical code'")
    expect(sql).toContain("raise exception 'VQH tenant code conflicts with the canonical ID'")
    expect(sql).toContain("raise exception 'VQH company ID conflicts with the canonical tenant or code'")
    expect(sql).toContain("raise exception 'VQH company code conflicts with the canonical ID'")
    expect(sql).toContain("'10000000-0000-4000-8000-000000000010', 'vqh', 'Việt Quốc Huy'")
    expect(sql).toMatch(/'10000000-0000-4000-8000-000000000010',\s*'VQH',\s*'Việt Quốc Huy'/)
    expect(sql.match(/on conflict \(id\) do update/g)).toHaveLength(2)
    expect(sql).not.toMatch(/auth\.users|tenant_memberships|company_memberships/i)
  })
})
