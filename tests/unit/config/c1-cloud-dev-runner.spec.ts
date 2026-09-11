import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runC1CloudDevTests, validateC1CloudDevSql } from '../../../scripts/run-c1-cloud-dev-tests.mjs'

describe('C1 Cloud DEV runner', () => {
  it('accepts the actual C1 foundation fixture before any Cloud command', () => {
    const path = 'c1_foundation.test.sql'
    const sql = readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1', path), 'utf8')

    expect(() => validateC1CloudDevSql(path, sql)).not.toThrow()
  })

  it.each([
    ["begin;\nselect 1;\ncommit;\nrollback;", 'C1 SQL verification cannot commit'],
    ["begin;\nmigration repair;\nrollback;", 'C1 SQL contains a forbidden Cloud DEV operation'],
    ["begin;\nselect 'VQH';\nrollback;", 'C1 SQL cannot reference real VQH identifiers'],
  ])('rejects unsafe SQL before spawning: %s', (sql, message) => {
    let spawns = 0
    expect(() => runC1CloudDevTests({ files: [{ path: 'c1_foundation.test.sql', sql }], spawn: () => { spawns += 1 } })).toThrow(message)
    expect(spawns).toBe(0)
  })
})
