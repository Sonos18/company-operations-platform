import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(import.meta.dirname, '../../../supabase/migrations/20260911145035_taskovia_c1_foundation.sql'), 'utf8')

describe('C1 master-data read policy contract', () => {
  it.each([
    ['projects', 'project.register.manage'],
    ['business_parties', 'party.manage'],
    ['project_engagements', 'engagement.manage'],
    ['engagement_components', 'engagement.manage'],
    ['company_cost_settings', 'cost.config.manage'],
  ])('allows authenticated SELECT on %s only through %s', (table, permission) => {
    expect(sql).toMatch(new RegExp(`grant select on [^;]*public\\.${table}[^;]* to authenticated`, 'u'))
    expect(sql).toMatch(new RegExp(`create policy c1_${table}_select on public\\.${table}[\\s\\S]*?private\\.has_company_permission\\(tenant_id, company_id, '${permission}'\\)`, 'u'))
  })

  it('does not widen direct table reads or writes', () => {
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.(?:company_cost_settings|projects|business_parties|project_engagements|engagement_components)\s+to\s+authenticated/iu)
    expect(sql).not.toMatch(/create policy c1_[^;]*'cost\.read'/u)
    expect(sql).not.toContain('company_admin')
    expect(sql).not.toMatch(/insert\s+into\s+public\.role_permissions/iu)
  })
})
