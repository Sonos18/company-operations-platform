import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, win32 } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isC1CloudDevCliInvocation, runC1CloudDevCli, runC1CloudDevTests, validateC1CloudDevSql } from '../../../scripts/run-c1-cloud-dev-tests.mjs'

describe('C1 Cloud DEV runner', () => {
  it('runs the Windows CLI entry point exactly once and never on import-style argv', () => {
    const scriptPath = win32.join('C:\\workspace with spaces', 'scripts', 'run-c1-cloud-dev-tests.mjs')
    const moduleUrl = pathToFileURL(scriptPath).href
    let calls = 0

    expect(isC1CloudDevCliInvocation({ argv: ['node', scriptPath], moduleUrl })).toBe(true)
    expect(runC1CloudDevCli({ argv: ['node', scriptPath], moduleUrl, run: () => { calls += 1 } })).toBe(true)
    expect(calls).toBe(1)
    expect(runC1CloudDevCli({ argv: ['node', 'vitest.mjs'], moduleUrl, run: () => { calls += 1 } })).toBe(false)
    expect(calls).toBe(1)
  })

  it('propagates a Supabase subprocess failure', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1/c1_foundation.test.sql'), 'utf8')

    expect(() => runC1CloudDevTests({ files: [{ path: 'c1_foundation.test.sql', sql }], spawn: () => ({ status: 1 }) })).toThrow('C1 Cloud DEV SQL verification failed')
  })

  it('accepts the actual C1 foundation fixture before any Cloud command', () => {
    const path = 'c1_foundation.test.sql'
    const sql = readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1', path), 'utf8')

    expect(() => validateC1CloudDevSql(path, sql)).not.toThrow()
  })

  it('accepts the rollback-only audited source-ownership correction fixture', () => {
    const path = 'c1_audited_source_ownership_correction.test.sql'
    const sql = 'begin;\nselect 1;\nrollback;'

    expect(() => validateC1CloudDevSql(path, sql)).not.toThrow()
  })

  it('requires the Project Cost fixture in the guarded allowlist', () => {
    expect(() => validateC1CloudDevSql('c1_project_cost_items.test.sql', 'begin;\nselect 1;\nrollback;')).not.toThrow()
  })

  it('accepts the actual rollback-only Project Cost fixture before any Cloud command', () => {
    const path = 'c1_project_cost_items.test.sql'
    const sql = readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1', path), 'utf8')

    expect(() => validateC1CloudDevSql(path, sql)).not.toThrow()
  })

  it.each([
    ["begin;\nselect 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';\nrollback;", 'Project Cost SQL must use reserved synthetic UUIDs'],
    ["begin;\nselect 'Eo Gió';\nrollback;", 'Project Cost SQL cannot reference real VQH names'],
    ['begin;\ncommit;\nrollback;', 'C1 SQL verification cannot commit'],
    ['begin;\ndb reset;\nrollback;', 'C1 SQL contains a forbidden Cloud DEV operation'],
    ['begin;\nmigration repair;\nrollback;', 'C1 SQL contains a forbidden Cloud DEV operation'],
    ['begin;\nselect * from supabase_migrations;\nrollback;', 'C1 SQL contains a forbidden Cloud DEV operation'],
  ])('rejects unsafe Project Cost fixture SQL: %s', (sql, message) => {
    expect(() => validateC1CloudDevSql('c1_project_cost_items.test.sql', sql)).toThrow(message)
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
