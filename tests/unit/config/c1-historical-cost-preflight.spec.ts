import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as rehearsal from '../../../scripts/run-c1-cloud-dev-migration-rehearsal.mjs'

const root = resolve(import.meta.dirname, '../../..')
const migration = readFileSync(resolve(root, 'supabase/migrations/20260930111326_c1_draft_list_parent_eligibility.sql'), 'utf8')

describe('C1 historical published cost preflight', () => {
  it('fails closed before replacing functions and reports bounded, actionable scoped diagnostics', () => {
    const guard = migration.match(/do \$c1_cost_history_preflight\$[\s\S]*?\$c1_cost_history_preflight\$;/u)?.[0]
    expect(guard).toBeDefined()
    expect(migration.indexOf(guard!)).toBeLessThan(migration.indexOf('create or replace function'))
    expect(guard).toContain('C1_PUBLISHED_COST_HISTORY_REQUIRES_REVIEW')
    expect(guard).toContain('detail.tenant_id = item.tenant_id')
    expect(guard).toContain('detail.company_id = item.company_id')
    expect(guard).toContain('detail.project_cost_item_id = item.id')
    expect(guard).toContain("detail.publication_state = 'published'")
    expect(guard).toContain("item.publication_state = 'published'")
    expect(guard).toContain('coalesce(sum(detail.amount_text::numeric), 0)')
    expect(guard).toContain('is distinct from')
    expect(guard).toContain('limit 20')
    for (const key of ['mismatchCount', 'parentId', 'tenantId', 'companyId', 'projectId', 'parentAmount', 'publishedDetailAmount', 'publishedDetailCount']) expect(guard).toContain(`'${key}'`)
    expect(guard).toContain('hint =')
    expect(guard).not.toMatch(/\b(insert into|update public\.|delete from|create|alter|drop)\b/iu)
    expect(guard).not.toMatch(/publication_origin\s*(?:=|<>|!=|in\s*\()/iu)
  })

  it('replays the production guard on isolated historical fixtures in the rollback rehearsal', () => {
    expect(rehearsal).toHaveProperty('readC1HistoryRehearsalSql')
    const sql = rehearsal.readC1HistoryRehearsalSql(root, migration)
    expect(sql).toContain('pg_temp.c1_history_parents')
    expect(sql).toContain('pg_temp.c1_history_details')
    expect(sql).not.toContain('public.project_cost_items')
    expect(sql).not.toContain('public.project_cost_item_details')
    expect(sql).not.toContain('-- C1_HISTORY_PREFLIGHT_BODY')
    for (const label of ['parent-only legacy balance', 'draft-only legacy balance', 'mismatched published balance', 'zero shell', 'explicit published zero', 'balanced legacy opening balance', 'cross-tenant detail', 'cross-company detail']) expect(sql).toContain(label)
    const wrapped = rehearsal.buildC1MigrationRehearsalSql(`${migration}\n${sql}`)
    expect(() => rehearsal.validateC1MigrationRehearsalSql(wrapped)).not.toThrow()
    expect(wrapped).toMatch(/rollback;\n$/u)
  })
})
