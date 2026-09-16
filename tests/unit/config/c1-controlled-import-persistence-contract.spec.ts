import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateC1CloudDevSql } from '../../../scripts/run-c1-cloud-dev-tests.mjs'
import { canonicalizeManifest } from '../../../server/features/costs/imports/import-manifest'

const root = process.cwd()
const migrationName = /_taskovia_c1_controlled_import\.sql$/
const normalizeEol = (value: string) => value.replace(/\r\n/g, '\n')

function assertExplicitIndexColumnsExist(sql: string, expectedIndexCount = 7) {
  sql = normalizeEol(sql)
  const tables = new Map<string, Set<string>>()
  for (const match of sql.matchAll(/create table (?:public|private)\.([a-z_]+) \(\n([\s\S]*?)\n\);/giu)) {
    tables.set(match[1], new Set([...match[2].matchAll(/^(?: ){2}([a-z_]+) (?:uuid|text|jsonb|boolean|bigint|integer|numeric|date|timestamptz)\b/gimu)].map(column => column[1])))
  }

  const indexes = [...sql.matchAll(/create index ([a-z_]+) on public\.([a-z_]+)\(([^;]+)\);/giu)]
  expect(indexes).toHaveLength(expectedIndexCount)
  for (const [, indexName, tableName, columns] of indexes) {
    const tableColumns = tables.get(tableName)
    expect(tableColumns, `${indexName} target table`).toBeDefined()
    for (const column of columns.split(',').map(column => column.trim())) expect(tableColumns!.has(column), `${indexName} column ${column}`).toBe(true)
  }
}

describe('C1 controlled-import pre-Cloud SQL contract', () => {
  it('consumes persistent c100 prerequisites while reserving c120 for commands foreign fixtures', () => {
    const commands = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_controlled_import_commands.test.sql'), 'utf8')

    expect(commands).toContain('C1 import prerequisite tenant missing')
    expect(commands).toContain("'c1200000-0000-4000-8000-000000000010'")
    expect(commands).toContain("'c1200000-0000-4000-8000-000000000020'")
    expect(commands).not.toContain("'c1010000-0000-4000-8000-000000000010'")
    expect(commands).not.toContain("(v_tenant_a, 'c1-import-a', 'C1 import tenant A')")
    expect(commands).not.toContain("(v_company_a1, v_tenant_a, 'C1-IMPORT-A1', 'C1 import company A1')")
    expect(commands).not.toContain("('c1000000-0000-4000-8000-000000000911', v_tenant_a, v_company_a1, 'c1_importer'")
  })

  it('consumes persistent c100 prerequisites while reserving c121 for security foreign fixtures', () => {
    const security = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_controlled_import_security.test.sql'), 'utf8')

    expect(security).toContain('C1 security prerequisite tenant missing')
    expect(security).toContain("'c1210000-0000-4000-8000-000000000010'")
    expect(security).toContain("'c1210000-0000-4000-8000-000000000020'")
    expect(security).not.toContain("'c1010000-0000-4000-8000-000000000010'")
    expect(security).not.toContain("(v_tenant_a, 'c1-security-a', 'C1 security tenant A')")
    expect(security).not.toContain("(v_company_a1, v_tenant_a, 'C1-SECURITY-A1', 'C1 security company A1')")
    expect(security).not.toContain("('c1000000-0000-4000-8000-000000000911', v_tenant_a, v_company_a1, 'c1_security_importer'")
  })

  it('keeps P1 immutable and prepares exactly one forward P2 migration', () => {
    const p1 = normalizeEol(readFileSync(resolve(root, 'supabase/migrations/20260911145035_taskovia_c1_foundation.sql'), 'utf8'))
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

  it('references only declared table columns from every explicit index', () => {
    const name = readdirSync(resolve(root, 'supabase/migrations')).find(value => migrationName.test(value))!
    const migration = readFileSync(resolve(root, 'supabase/migrations', name), 'utf8')

    expect(() => assertExplicitIndexColumnsExist(migration)).not.toThrow()
    expect(migration).toMatch(/create index source_review_issues_selection_idx on public\.source_review_issues\([\s\S]*\bopened_at\b/iu)
  })

  it('rejects an explicit index column missing from its target table', () => {
    expect(() => assertExplicitIndexColumnsExist(`create table public.example (\n  id uuid not null\n);\ncreate index example_missing_idx on public.example(id, missing_column);`, 1)).toThrow('example_missing_idx column missing_column')
  })

  it('keeps the frozen fixture digest compatible with deterministic C key ordering', () => {
    const fixture = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_controlled_import_commands.test.sql'), 'utf8')
    const matches = [...fixture.matchAll(/v_frozen_manifest\s*:=\s*\$manifest\$([\s\S]*?)\$manifest\$::jsonb/gu)]
    expect(matches).toHaveLength(1)
    expect(canonicalizeManifest(JSON.parse(matches[0]![1])).digest).toBe('8651b0ef29773117d53b09403e9be2762df0709e2b623587938080610d1557f8')

    const corrections = readdirSync(resolve(root, 'supabase/migrations')).filter(name => /_taskovia_c1_canonical_order_fix\.sql$/u.test(name))
    expect(corrections).toHaveLength(1)
    const correction = readFileSync(resolve(root, 'supabase/migrations', corrections[0]!), 'utf8')
    expect(correction).toContain('order by entry.key collate "C"')
  })

  it('keeps the canonical compatibility vector independently frozen', () => {
    const fixture = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_controlled_import_commands.test.sql'), 'utf8')
    const matches = [...fixture.matchAll(/\$canonical_vector\$([\s\S]*?)\$canonical_vector\$/gu)]
    expect(matches).toHaveLength(1)
    expect(canonicalizeManifest).toBeDefined()
    expect(createHash('sha256').update(matches[0]![1]).digest('hex')).toBe('30aa13579b994c286fe1c15d276686e9e4e77821ff99234c92e37926a06d9f60')
  })

  it.each(['c1_controlled_import_commands.test.sql', 'c1_controlled_import_security.test.sql'])('runner statically accepts %s before Cloud access', (name) => {
    const sql = readFileSync(resolve(root, 'supabase/tests/database/c1', name), 'utf8')
    expect(() => validateC1CloudDevSql(name, sql)).not.toThrow()
  })

  it('groups locator JSON extraction before concatenation and prepares every occurrence-key regression', () => {
    const name = readdirSync(resolve(root, 'supabase/migrations')).find(value => migrationName.test(value))!
    const migration = readFileSync(resolve(root, 'supabase/migrations', name), 'utf8')
    const commands = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_controlled_import_commands.test.sql'), 'utf8')

    expect(migration).toContain("'logical_section|' || (v_descriptor #>> '{locator,section}')")
    expect(migration).toContain("'cell_range|' || (v_descriptor #>> '{locator,sheetName}') || '|' || (v_descriptor #>> '{locator,range}')")
    expect(migration).not.toMatch(/\|\|\s*v_descriptor\s*#>>/u)
    for (const key of ['cell_range| Nhật ký |A1:B2', 'cell_range| Bảng đối chiếu |AA1:AAA2', 'logical_section|Reference note', 'whole_file']) expect(commands).toContain(key)
  })

  it('prepares direct-RPC JSON null, type, string-array, and amount regressions', () => {
    const name = readdirSync(resolve(root, 'supabase/migrations')).find(value => migrationName.test(value))!
    const migration = readFileSync(resolve(root, 'supabase/migrations', name), 'utf8')
    const commands = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_controlled_import_commands.test.sql'), 'utf8')

    expect(migration).toContain("jsonb_typeof(target_request->'approvedManifestDigest') is distinct from 'string'")
    expect(migration).toContain("jsonb_typeof(v_manifest#>'{expected,figures}') is distinct from 'number'")
    expect(migration).toContain("jsonb_typeof(item->'amount') is distinct from 'string'")
    expect(migration).toContain("jsonb_typeof(item->'amount') is distinct from 'null'")
    expect(migration).toContain('private.c1_jsonb_is_string_array')
    for (const label of ['invalid-approved-null', 'invalid-expected-null', 'invalid-expected-string', 'invalid-known-number', 'invalid-raw-array-element']) expect(commands).toContain(`'${label}'`)
    expect(commands).toContain("figure.amount_text = '0'")
    expect(commands).toContain("figure.value_state = 'formula_error' and figure.amount_text is null")
  })

  it('scopes privileged fixture assertions and immutable-history mutation to fixture-owned rows', () => {
    const commands = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_controlled_import_commands.test.sql'), 'utf8')

    expect(commands).not.toMatch(/update\s+public\.accounting_source_versions\s+set/iu)
    expect(commands).not.toMatch(/count\(\*\)\s+from\s+public\.(?:projects|business_parties|project_engagements|engagement_components)\s*\)/iu)
    expect(commands).toContain('C1-UNRELATED-SOURCE')
    expect(commands).toContain('C1 unrelated synthetic row changed')
  })
})
