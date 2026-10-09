import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'
import { isolatedSupabaseEnvironment } from './run-supabase-dev.mjs'
import { validateC1CloudDevSql } from './run-c1-cloud-dev-tests.mjs'

const testPath = 'c1_material_procurement_a1.test.sql'
const plan = 'select plan(33);'
const finish = "select 'A1_MATERIAL_PGTAP_COMPLETE' as result, (select count(*) from finish(true)) as finish_count;"
const assertion = /^select (is|throws_ok|lives_ok)\s*\(/gim

export function materialA1DiagnosticSql(source) {
  validateC1CloudDevSql(testPath, source)
  if (source.split(plan).length !== 2 || source.split(finish).length !== 2) {
    throw new Error('A1 diagnostic source drift')
  }
  const matches = [...source.matchAll(assertion)]
  if (matches.length !== 33) throw new Error('A1 diagnostic assertion count drift')
  const sql = source
    .replace(plan, plan + '\ncreate temporary table a1_tap_lines(line text);\ngrant insert on a1_tap_lines to authenticated, service_role;')
    .replace(assertion, (_, name) => `insert into a1_tap_lines(line) select ${name}(`)
    .replace(finish, `select
  (select jsonb_agg(line) from a1_tap_lines) as tap_lines,
  (select jsonb_agg(f.line) from finish() as f(line)) as finish_lines,
  'A1_MATERIAL_PGTAP_DIAGNOSTIC_COMPLETE' as result;`)
  validateC1CloudDevSql(testPath, sql)
  return sql
}

export function runMaterialA1Diagnostic({
  cwd = process.cwd(), env = process.env, spawn = spawnSync,
  assertTarget = assertCloudDevTarget, createCliEnvironment = isolatedSupabaseEnvironment,
} = {}) {
  const source = readFileSync(resolve(cwd, 'supabase/tests/database/c1', testPath), 'utf8')
  const sql = materialA1DiagnosticSql(source)
  assertTarget({ cwd, env })
  const directory = mkdtempSync(join(tmpdir(), 'taskovia-a1-pgtap-diagnostic-'))
  try {
    const file = join(directory, 'diagnostic.sql')
    writeFileSync(file, sql, { encoding: 'utf8', mode: 0o600 })
    const cli = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
    const result = spawn(process.execPath, [cli, 'db', 'query', '--linked', '--output-format', 'json', '--file', file], {
      cwd, env: createCliEnvironment(cwd, env, process.platform), encoding: 'utf8', timeout: 120_000,
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error('A1 rollback diagnostic query failed')
    const stdout = String(result.stdout ?? '')
    const starts = [stdout.indexOf('{'), stdout.indexOf('[')].filter(index => index >= 0)
    if (starts.length === 0) throw new Error('A1 rollback diagnostic returned no JSON')
    const response = JSON.parse(stdout.slice(Math.min(...starts)))
    const rows = Array.isArray(response) ? response.flatMap(value => Array.isArray(value?.rows) ? value.rows : [value]) : response?.rows
    const row = rows?.find(value => value?.result === 'A1_MATERIAL_PGTAP_DIAGNOSTIC_COMPLETE')
    const lines = typeof row?.tap_lines === 'string' ? JSON.parse(row.tap_lines) : row?.tap_lines
    const summary = typeof row?.finish_lines === 'string' ? JSON.parse(row.finish_lines) : row?.finish_lines
    if (!Array.isArray(lines) || lines.length !== 33) {
      throw new Error('A1 rollback diagnostic result is incomplete')
    }
    const failed = lines.filter(line => typeof line === 'string' && /^not ok\b/i.test(line))
    console.log(JSON.stringify({ failed, summary: Array.isArray(summary) ? summary : [] }))
    if (failed.length === 0) throw new Error('A1 rollback diagnostic found no failing assertion')
    return failed
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--execute') throw new Error('A1 diagnostic requires --execute')
  runMaterialA1Diagnostic()
}
