import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function correctionSql() {
  const directory = resolve(process.cwd(), 'supabase/migrations')
  const names = readdirSync(directory).filter(name => name.endsWith('_c1_ordinary_cost_detail_review_fixes.sql'))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(directory, names[0]!), 'utf8')
}

describe('C1 ordinary detail review corrections', () => {
  it('replays receipt versions with fixed command publication states without expanding receipts', () => {
    const sql = correctionSql()

    expect(sql).toContain('create or replace function private.c1_detail_replay_ack')
    expect(sql).toMatch(/v_receipt\.result_resource_id\s*,\s*v_receipt\.result_version\s*,\s*'draft'/iu)
    expect([...sql.matchAll(/v_receipt\.result_resource_id\s*,\s*v_receipt\.result_version\s*,\s*'published'/giu)]).toHaveLength(3)
    expect(sql).not.toMatch(/alter\s+table\s+public\.cost_command_receipts/iu)
    expect(sql).not.toMatch(/result_(?:snapshot|json|payload)/iu)
  })

  it('requires prepare and source-read together for draft metadata without changing raw-byte authorization', () => {
    const sql = correctionSql()
    const metadataHelper = sql.match(/create or replace function private\.c1_can_read_project_cost_detail_evidence_metadata[\s\S]*?\$\$;/iu)?.[0] ?? ''

    expect(metadataHelper).toContain("detail.publication_state = 'published'")
    expect(metadataHelper).toContain("detail.publication_state = 'draft'")
    expect(metadataHelper).toContain("'cost.source.read'")
    expect(metadataHelper).toContain("'cost.prepare'")
    expect(sql).toContain('grant execute on function private.c1_can_read_project_cost_detail_evidence_metadata(uuid,uuid,uuid) to authenticated')
    expect(sql).not.toContain('create or replace function private.c1_can_select_evidence_object')
  })
})
