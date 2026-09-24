import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { projectCostDraftManagementMetadataSchema } from '../../../shared/schemas/costs/project-costs'

const root = process.cwd()
const migrations = resolve(root, 'supabase/migrations')
const names = readdirSync(migrations).filter(name => name.endsWith('_c1_ordinary_cost_detail_lifecycle_foundation.sql'))
const sql = names.length === 1 ? readFileSync(resolve(migrations, names[0]!), 'utf8') : ''

describe('C1 ordinary cost detail lifecycle foundation', () => {
  it('maps the approved category strategies and exposes them in draft metadata', () => {
    expect(names).toHaveLength(1)
    expect(sql).toMatch(/add column posting_strategy text/iu)
    expect(sql).toMatch(/subcontract_labor[\s\S]*subcontract_payment/iu)
    expect(sql).toMatch(/materials[\s\S]*ordinary_detail/iu)
    expect(projectCostDraftManagementMetadataSchema.parse({
      projects: [],
      categories: [{ categoryId: 'c1010000-0000-4000-8000-000000000301', code: 'materials', name: 'Materials', isActive: true, draftEligible: true, postingStrategy: 'ordinary_detail' }],
    }).categories[0]!.postingStrategy).toBe('ordinary_detail')
  })

  it('backfills category strategy without impersonating a business actor', () => {
    expect(sql).toMatch(/alter table public\.cost_categories disable trigger a_c1_finance_prepare;[\s\S]*disable trigger z_c1_finance_audit;[\s\S]*update public\.cost_categories[\s\S]*enable trigger a_c1_finance_prepare;[\s\S]*enable trigger z_c1_finance_audit;/iu)
  })

  it('defines detail lifecycle, published-only aggregation, and a private ordinary parent resolver', () => {
    expect(sql).toMatch(/project_cost_item_details[\s\S]*add column publication_state text/iu)
    expect(sql).toMatch(/publication_origin[\s\S]*published_by[\s\S]*published_at[\s\S]*publication_request_id/iu)
    expect(sql).toMatch(/detail\.publication_state = 'published'/iu)
    expect(sql).toMatch(/create function private\.c1_resolve_or_create_ordinary_project_cost_item/iu)
    expect(sql).toContain('SUBCONTRACT_COST_MODEL_UNSUPPORTED')
    expect(sql).toMatch(/update public\.project_cost_item_details[\s\S]*set constraints c1_project_cost_item_details_sync immediate;[\s\S]*set constraints c1_project_cost_item_details_sync deferred;[\s\S]*alter table public\.project_cost_item_details/iu)
  })

  it('grants the detail RLS helper to the authenticated policy role only', () => {
    expect(sql).toMatch(/revoke all on function private\.c1_can_read_project_cost_detail\(uuid, uuid, uuid, text\) from public, anon, authenticated;[\s\S]*grant execute on function private\.c1_can_read_project_cost_detail\(uuid, uuid, uuid, text\) to authenticated;/iu)
  })
})
