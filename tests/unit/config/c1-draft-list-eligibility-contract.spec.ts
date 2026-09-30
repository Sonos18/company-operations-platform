import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('C1 forward-only draft list eligibility migration', () => {
  it('matches the draft reader parent and category scope before projecting either permission view', () => {
    const directory = resolve(process.cwd(), 'supabase/migrations')
    const files = readdirSync(directory).filter(name => name.endsWith('_c1_draft_list_parent_eligibility.sql'))
    expect(files).toHaveLength(1)
    const sql = readFileSync(resolve(directory, files[0]!), 'utf8')
    expect(sql).toContain('create or replace function private.c1_list_project_cost_detail_drafts')
    expect(sql).toContain("item.publication_state = 'published'")
    expect(sql).toContain('item.tenant_id = detail.tenant_id')
    expect(sql).toContain('item.company_id = detail.company_id')
    expect(sql).toContain('category.tenant_id = item.tenant_id')
    expect(sql).toContain('category.company_id = item.company_id')
    expect(sql).toContain("case when target_operational then 'cost.manage' else 'cost.prepare' end")
    expect(sql).not.toMatch(/category\.(is_active|posting_strategy)|for update/iu)
  })
})
