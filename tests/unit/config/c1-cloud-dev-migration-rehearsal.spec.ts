import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildC1MigrationRehearsalSql, readC1MigrationSql, runC1MigrationRehearsal, validateC1MigrationRehearsalSql } from '../../../scripts/run-c1-cloud-dev-migration-rehearsal.mjs'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('C1 Cloud DEV migration rehearsal runner', () => {
  const migrationNames = [
    '20260922090000_c1_accounting_write_publication_rbac.sql',
    '20260923134446_c1_accounting_write_draft_management_metadata.sql',
    '20260924093428_c1_ordinary_cost_detail_lifecycle_foundation.sql',
    '20260924110107_c1_ordinary_cost_detail_commands.sql',
    '20260924120131_c1_ordinary_cost_detail_provenance_evidence_reads.sql',
    '20260924142834_c1_ordinary_cost_detail_publish_hash_fix.sql',
  ]

  function migrationRoot(names = migrationNames) {
    const root = mkdtempSync(join(tmpdir(), 'taskovia-c1-rehearsal-'))
    roots.push(root)
    const directory = join(root, 'supabase', 'migrations')
    mkdirSync(directory, { recursive: true })
    names.forEach((name, index) => writeFileSync(join(directory, name), `select ${index + 1};\n`, 'utf8'))
    return root
  }

  it('wraps the exact migration body in one rollback-only transaction', () => {
    const sql = buildC1MigrationRehearsalSql('select 1;')

    expect(sql).toBe('begin;\nselect 1;\nrollback;\n')
    expect(() => validateC1MigrationRehearsalSql(sql)).not.toThrow()
  })

  it('refuses transaction controls inside the migration body', () => {
    expect(() => buildC1MigrationRehearsalSql('commit;')).toThrow('C1 migration rehearsal cannot contain transaction control')
  })

  it('loads the exact currently pending C1 stack once in timestamp order and excludes applied history', () => {
    const sql = readC1MigrationSql(migrationRoot())

    expect(sql).toBe('select 6;\n')
  })

  it('rejects a missing pending migration before Cloud access', () => {
    expect(() => readC1MigrationSql(migrationRoot(migrationNames.filter(name => !name.includes('publish_hash_fix'))))).toThrow('C1 migration rehearsal requires exactly one migration for _c1_ordinary_cost_detail_publish_hash_fix.sql')
  })

  it('rejects duplicate migration suffixes before Cloud access', () => {
    const duplicate = ['20260924142835_c1_ordinary_cost_detail_publish_hash_fix.sql', ...migrationNames]
    expect(() => readC1MigrationSql(migrationRoot(duplicate))).toThrow('C1 migration rehearsal requires exactly one migration for _c1_ordinary_cost_detail_publish_hash_fix.sql')
  })

  it('checks the Cloud DEV target before dispatching the temporary rehearsal SQL', () => {
    const root = mkdtempSync(join(tmpdir(), 'taskovia-c1-rehearsal-'))
    roots.push(root)
    let spawns = 0

    expect(() => runC1MigrationRehearsal({
      cwd: root,
      migrationSql: 'select 1;',
      assertTarget: () => { throw new Error('target mismatch') },
      spawn: () => { spawns += 1; return { status: 0 } },
    })).toThrow('target mismatch')
    expect(spawns).toBe(0)
  })
})
