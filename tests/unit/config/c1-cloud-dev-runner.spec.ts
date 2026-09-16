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

  it('keeps foundation in the c110/c111 transaction-only namespaces', () => {
    const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1', name), 'utf8')
    const foundation = fixture('c1_foundation.test.sql')

    expect(foundation).not.toContain('c1000000-0000-4000-8000-000000000010')
    expect(foundation).toContain('c1100000-0000-4000-8000-000000000010')
    expect(foundation).toContain('c1110000-0000-4000-8000-000000000010')
  })

  it('reserves c120 for controlled-import commands foreign fixtures', () => {
    const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1', name), 'utf8')
    const commands = fixture('c1_controlled_import_commands.test.sql')

    expect(commands).toContain('c1200000-0000-4000-8000-000000000010')
    expect(commands).not.toContain('c1010000-0000-4000-8000-000000000010')
  })

  it('reserves c121 for controlled-import security foreign fixtures', () => {
    const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1', name), 'utf8')
    const security = fixture('c1_controlled_import_security.test.sql')

    expect(security).toContain('c1210000-0000-4000-8000-000000000010')
    expect(security).not.toContain('c1010000-0000-4000-8000-000000000010')
  })

  it('keeps Project Cost and audited ownership fixture namespaces independent', () => {
    const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1', name), 'utf8')
    const projectCost = fixture('c1_project_cost_items.test.sql')
    const auditedOwnership = fixture('c1_audited_source_ownership_correction.test.sql')

    expect(projectCost).toContain('c1010000-0000-4000-8000-000000000010')
    expect(auditedOwnership).toContain('c1020000-0000-4000-8000-000000000010')
    expect(auditedOwnership).toContain('c1030000-0000-4000-8000-000000000010')
  })

  it('accepts the rollback-only audited source-ownership correction fixture', () => {
    const path = 'c1_audited_source_ownership_correction.test.sql'
    const sql = 'begin;\nselect 1;\nrollback;'

    expect(() => validateC1CloudDevSql(path, sql)).not.toThrow()
  })

  it('rejects non-synthetic UUIDs in audited source ownership SQL', () => {
    expect(() => validateC1CloudDevSql(
      'c1_audited_source_ownership_correction.test.sql',
      "begin;\nselect 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';\nrollback;",
    )).toThrow('Audited source ownership SQL must use reserved synthetic UUIDs')
  })

  it('keeps audited source ownership verification independent of real VQH rows', () => {
    const path = 'c1_audited_source_ownership_correction.test.sql'
    const sql = readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1', path), 'utf8')

    expect(() => validateC1CloudDevSql(path, sql)).not.toThrow()
    for (const id of [
      '7e7e3904-d53b-4337-9360-22256887474a',
      '22727545-1534-4c1a-9378-06969cb40f97',
      '087485b2-d63f-45a3-90cf-5693abbf25d9',
      '83cbc0d2-568b-4b17-b5a8-779f218dbd37',
    ]) expect(sql).not.toContain(id)
    expect(sql).not.toContain('C1 audited correction real-object snapshot is incomplete')
    expect(sql).not.toContain('C1 audited correction changed real Yong Mei state')
    expect(sql).toContain('C1 audited correction changed unrelated selection')
    expect(sql).toContain('C1 audited correction changed unrelated figure')
  })

  it('requires the Project Cost fixture in the guarded allowlist', () => {
    expect(() => validateC1CloudDevSql('c1_project_cost_items.test.sql', 'begin;\nselect 1;\nrollback;')).not.toThrow()
  })

  it('accepts the actual rollback-only Project Cost fixture before any Cloud command', () => {
    const path = 'c1_project_cost_items.test.sql'
    const sql = readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1', path), 'utf8')

    expect(() => validateC1CloudDevSql(path, sql)).not.toThrow()
  })

  it('uses PERFORM when Project Cost RPC results are discarded', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1/c1_project_cost_items.test.sql'), 'utf8')
    const rpcSelects = [...sql.matchAll(/\bselect\s+public\.c1_(?:create|update|correct)_project_cost_item\s*\([^;]*;/giu)]
      .map(([statement]) => statement)
    const bareSelects = rpcSelects.filter(statement => !/\binto\b/iu.test(statement))

    expect(rpcSelects.some(statement => /\binto\s+first_create\s*;/iu.test(statement))).toBe(true)
    expect(rpcSelects.some(statement => /\binto\s+replay\s*;/iu.test(statement))).toBe(true)
    expect(bareSelects, `${bareSelects.length} Project Cost RPC SELECT statements lack INTO`).toEqual([])
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
