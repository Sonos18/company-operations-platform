import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('C1 draft management metadata migration contract', () => {
  it('exposes only a company-scoped project/category projection to manage or prepare actors', () => {
    const migrations = resolve(process.cwd(), 'supabase/migrations')
    const matches = readdirSync(migrations).filter(name => name.endsWith('_c1_accounting_write_draft_management_metadata.sql'))
    expect(matches).toHaveLength(1)
    const sql = readFileSync(resolve(migrations, matches[0]!), 'utf8')

    expect(sql).toMatch(/create\s+(?:or\s+replace\s+)?function\s+public\.c1_read_project_cost_draft_management_metadata\s*\(\s*target_company_id\s+uuid\s*\)/iu)
    expect(sql).toMatch(/v_actor_id\s+uuid\s*:=\s*auth\.uid\(\)[\s\S]*if\s+v_actor_id\s+is\s+null/iu)
    expect(sql).toMatch(/private\.has_company_permission\([^)]*'cost\.manage'\)/iu)
    expect(sql).toMatch(/private\.has_company_permission\([^)]*'cost\.prepare'\)/iu)
    expect(sql).toMatch(/project\.tenant_id\s*=\s*v_tenant_id[\s\S]*project\.company_id\s*=\s*target_company_id/iu)
    expect(sql).toMatch(/category\.tenant_id\s*=\s*v_tenant_id[\s\S]*category\.company_id\s*=\s*target_company_id/iu)
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.c1_read_project_cost_draft_management_metadata\(uuid\)\s+to\s+authenticated/iu)
    expect(sql).not.toMatch(/amount_text|paid_amount|budget|margin|source_figure/iu)
  })
})
