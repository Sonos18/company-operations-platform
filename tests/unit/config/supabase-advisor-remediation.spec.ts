import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationsDir = resolve(root, 'supabase/migrations')

function advisorRemediationMigration() {
  const filenames = readdirSync(migrationsDir)
    .filter(name => name.endsWith('_harden_cloud_dev_advisor_warnings.sql'))

  expect(filenames).toHaveLength(1)
  return readFileSync(resolve(migrationsDir, filenames[0]!), 'utf8')
    .replace(/\r\n?/g, '\n')
}

describe('Cloud DEV advisor remediation migration', () => {
  it('hardens trigger functions without dropping the RLS event trigger', () => {
    const sql = advisorRemediationMigration()

    expect(sql).toContain("alter function public.set_updated_at() set search_path = ''")
    expect(sql).toContain("to_regprocedure('public.rls_auto_enable()')")
    expect(sql).toContain(
      'revoke execute on function public.rls_auto_enable() from public, anon, authenticated',
    )
    expect(sql).not.toMatch(/drop\s+event\s+trigger|drop\s+function/i)
  })

  it('preserves policy semantics while caching the authenticated user id', () => {
    const sql = advisorRemediationMigration()

    expect(sql).toContain('drop policy if exists roles_select_company_role_catalog on public.roles')
    expect(sql).toContain('create policy roles_select_company_role_catalog on public.roles')
    expect(sql).toMatch(
      /drop policy if exists company_role_assignments_select_self_or_role_manager\s+on public\.company_role_assignments/,
    )
    expect(sql).toMatch(
      /create policy company_role_assignments_select_self_or_role_manager\s+on public\.company_role_assignments/,
    )
    expect(sql.match(/\(select auth\.uid\(\)\)/g)).toHaveLength(2)
    expect(sql).not.toMatch(/=\s*auth\.uid\(\)/)
    expect(sql).not.toMatch(/\b(?:insert|update|delete|truncate)\b/i)
  })
})
