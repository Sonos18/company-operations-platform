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
    '20260922090001_c1_accounting_write_draft_commands.sql',
    '20260922090002_c1_accounting_write_evidence_storage.sql',
    '20260922090003_c1_accounting_write_publish_command.sql',
    '20260922090004_c1_accounting_write_correction_command.sql',
    '20260922090005_c1_accounting_write_cash_commands.sql',
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

  it('loads all six accounting-write migrations once in timestamp order', () => {
    const sql = readC1MigrationSql(migrationRoot())

    expect(sql).toBe('select 1;\n\nselect 2;\n\nselect 3;\n\nselect 4;\n\nselect 5;\n\nselect 6;\n')
  })

  it('rejects a missing accounting-write migration before Cloud access', () => {
    expect(() => readC1MigrationSql(migrationRoot(migrationNames.slice(0, 5)))).toThrow('C1 migration rehearsal requires exactly one migration for _c1_accounting_write_cash_commands.sql')
  })

  it('rejects duplicate migration suffixes before Cloud access', () => {
    const duplicate = ['20260922080000_c1_accounting_write_publication_rbac.sql', ...migrationNames]
    expect(() => readC1MigrationSql(migrationRoot(duplicate))).toThrow('C1 migration rehearsal requires exactly one migration for _c1_accounting_write_publication_rbac.sql')
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
