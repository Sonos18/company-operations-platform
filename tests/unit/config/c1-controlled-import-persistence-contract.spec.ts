import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateC1CloudDevSql } from '../../../scripts/run-c1-cloud-dev-tests.mjs'

const root = process.cwd()
const migrationName = /_taskovia_c1_controlled_import\.sql$/

describe('C1 controlled-import pre-Cloud SQL contract', () => {
  it('keeps P1 immutable and prepares exactly one forward P2 migration', () => {
    const p1 = readFileSync(resolve(root, 'supabase/migrations/20260911145035_taskovia_c1_foundation.sql'))
    expect(createHash('sha256').update(p1).digest('hex').toUpperCase()).toBe('538025216FEC8B67A8A94226D67B35F723D005069AEA00B003FB4DCE6089C556')
    expect(readdirSync(resolve(root, 'supabase/migrations')).filter(name => migrationName.test(name))).toHaveLength(1)
  })

  it('keeps the immutable manifest snapshot minimal and source-only', () => {
    const name = readdirSync(resolve(root, 'supabase/migrations')).find(value => migrationName.test(value))!
    const sql = readFileSync(resolve(root, 'supabase/migrations', name), 'utf8')
    for (const table of ['controlled_import_runs', 'controlled_import_descriptor_map', 'accounting_sources', 'accounting_source_versions', 'source_selections', 'source_reported_figures', 'source_review_issues']) expect(sql).toContain(`create table public.${table}`)
    expect(sql).toContain('manifest_snapshot jsonb')
    expect(sql).toContain('create table private.controlled_import_adapter_versions')
    expect(sql).toContain("message = 'ADAPTER_NOT_PERMITTED'")
    expect(sql).toContain('c1_controlled_import_events_immutable')
    expect(sql).toContain('private.c1_normalize_import_cell_range')
    expect(sql).toContain("<> private.c1_normalize_import_cell_range")
    expect(sql).toContain('grant execute on function private.c1_can_read_import_draft(uuid, uuid) to authenticated')
    expect(sql).not.toMatch(/create table public\..*manifest/iu)
    expect(sql).not.toMatch(/create table public\.(?:cost_documents|cost_document_lines|payments|allocations|file_objects)/iu)
    expect(sql).toContain('unique (company_id, command_name, idempotency_key)')
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('force row level security')
    expect(sql).toContain('c1_persist_controlled_import')
    expect(sql).toContain('c1_get_controlled_import_result')
    expect(sql).not.toMatch(/\bdeclare\s+(?:context|actor_id|tenant_id|manifest|import_run_id|result)\b/iu)
    expect(sql).not.toMatch(/\bwhere\s+(?:map\.)?import_run_id\s*=\s*import_run_id\b/iu)
  })

  it.each(['c1_controlled_import_commands.test.sql', 'c1_controlled_import_security.test.sql'])('runner statically accepts %s before Cloud access', (name) => {
    const sql = readFileSync(resolve(root, 'supabase/tests/database/c1', name), 'utf8')
    expect(() => validateC1CloudDevSql(name, sql)).not.toThrow()
  })
})
