import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildC1MigrationRehearsalSql, runC1MigrationRehearsal, validateC1MigrationRehearsalSql } from '../../../scripts/run-c1-cloud-dev-migration-rehearsal.mjs'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('C1 Cloud DEV migration rehearsal runner', () => {
  it('wraps the exact migration body in one rollback-only transaction', () => {
    const sql = buildC1MigrationRehearsalSql('select 1;')

    expect(sql).toBe('begin;\nselect 1;\nrollback;\n')
    expect(() => validateC1MigrationRehearsalSql(sql)).not.toThrow()
  })

  it('refuses transaction controls inside the migration body', () => {
    expect(() => buildC1MigrationRehearsalSql('commit;')).toThrow('C1 migration rehearsal cannot contain transaction control')
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
