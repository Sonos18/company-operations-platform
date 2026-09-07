import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Stage 01 security permission contract', () => {
  it('prepares the command Final Decision fixture with the domain permission and a no-permission control', () => {
    const sql = read('supabase/tests/database/stage01_commands.test.sql')
    const commandRolePermissions = sql.slice(
      sql.indexOf('insert into public.role_permissions (role_id, permission_code) values'),
      sql.indexOf('insert into public.company_role_assignments'),
    )

    expect(commandRolePermissions).toContain("('55000000-0000-4000-8000-000000000100', 'opportunity.decision.record')")
    expect(commandRolePermissions).not.toContain('opportunity.decision_authority.assign')
    expect(sql).toContain("'55000000-0000-4000-8000-000000000003', 'stage01-commands-permission-denied@test.invalid'")
    expect(sql).toContain("'S01-CMD-ACTOR', 'Stage 01 command actor', 'stage01-commands@test.invalid'")
    expect(sql).toContain("'55000000-0000-4000-8000-000000000110', 'active'")
    expect(sql).toContain('"sub":"55000000-0000-4000-8000-000000000003","role":"authenticated"')
    expect(sql).toContain("'PERMISSION_DENIED'")
    expect(sql.indexOf("'PERMISSION_DENIED'"))
      .toBeLessThan(sql.indexOf("'STAGE01_CURRENT_RECOMMENDATION_REQUIRED'"))
  })

  it('prepares the generic public-RPC flow actor with the current Final Decision domain permission', () => {
    const sql = read('supabase/tests/database/stage01_flows.test.sql')
    const flowRolePermissions = sql.slice(
      sql.indexOf('insert into public.role_permissions (role_id, permission_code)'),
      sql.indexOf('insert into public.company_role_assignments'),
    )

    expect(flowRolePermissions).toContain("('opportunity.decision.record')")
    expect(flowRolePermissions).not.toContain("('opportunity.decision_authority.assign')")
  })

  it('limits the non-config operational-role topology check to canonical VQH without weakening config-permission isolation', () => {
    const sql = read('supabase/tests/database/stage01_security.test.sql')
    const topologyGuard = sql.slice(
      sql.indexOf('from public.role_permissions as role_permission'),
      sql.indexOf("raise exception 'DB-S01-SEC non-config Stage 01 permission was inferred for an operational role'"),
    )

    expect(topologyGuard).toContain("company_role.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid")
    expect(topologyGuard).toContain("company_role.company_id = '10000000-0000-4000-8000-000000000020'::uuid")
    expect(sql).toContain("raise exception 'DB-S01-SEC config permission leaked beyond canonical VQH company_admin'")
  })

  it('checks complete non-config catalog membership against the exact canonical VQH company-admin role', () => {
    const sql = read('supabase/tests/database/stage01_security.test.sql')
    const completenessGuard = sql.slice(
      sql.indexOf('from public.roles as company_role'),
      sql.indexOf("raise exception 'DB-S01-SEC company_admin does not have the complete non-config Stage 01 catalog'"),
    )

    expect(completenessGuard).toContain("company_role.id = '10000000-0000-4000-8000-000000000308'::uuid")
    expect(completenessGuard).toContain("company_role.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid")
    expect(completenessGuard).toContain("company_role.company_id = '10000000-0000-4000-8000-000000000020'::uuid")
  })
})
