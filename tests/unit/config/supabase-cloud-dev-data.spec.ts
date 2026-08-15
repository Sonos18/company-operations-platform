import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationsDir = resolve(root, 'supabase/migrations')

describe('Cloud DEV VQH bootstrap migration', () => {
  it('contains only idempotent VQH tenant and company data', () => {
    const filename = readdirSync(migrationsDir)
      .find(name => name.endsWith('_bootstrap_vqh_tenant.sql'))

    expect(filename).toBeDefined()
    const sql = readFileSync(resolve(migrationsDir, filename!), 'utf8')

    expect(sql).toContain("'10000000-0000-4000-8000-000000000010', 'vqh'")
    expect(sql).toContain("'10000000-0000-4000-8000-000000000020'")
    expect(sql).toMatch(/'10000000-0000-4000-8000-000000000010',\s*'VQH'/)
    expect(sql.match(/on conflict do nothing/g)).toHaveLength(2)
    expect(sql).not.toMatch(/auth\.users|tenant_memberships|company_memberships/i)
    expect(sql).not.toMatch(/isolation|\.local/i)
  })
})
