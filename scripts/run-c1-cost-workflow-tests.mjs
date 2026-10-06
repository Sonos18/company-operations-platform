import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'
import { isolatedSupabaseEnvironment } from './run-supabase-dev.mjs'

export const costWorkflowSqlFiles = [
  'c1_cost_workflow_security.test.sql',
  'c1_cost_workflow_evidence.test.sql',
  'c1_cost_workflow_requests.test.sql',
  'c1_cost_workflow_cash.test.sql',
]
export function validateCostWorkflowSql(path, sql) {
  if (!costWorkflowSqlFiles.includes(path)) throw new Error('UNKNOWN_WORKFLOW_SQL')
  const value = sql.replace(/\r\n?/g, '\n').trim()
  if (!/^begin\s*;/i.test(value) || !/rollback\s*;$/i.test(value) || /\bcommit\s*;/i.test(value)) throw new Error('WORKFLOW_SQL_MUST_ROLLBACK')
  const statements = value.replace(/'(?:SELECT,)?INSERT,UPDATE,DELETE,TRUNCATE'/g, '')
  if (/\b(?:delete|truncate|drop|reset|repair|seed|execute|dblink|pg_read_file|pg_ls_dir|lo_import|copy)\b|\bdisable\s+trigger\b|supabase_migrations/i.test(statements)) throw new Error('UNSAFE_WORKFLOW_SQL')
  if (/\bVQH\b|10000000-0000-4000-8000-0000000000/i.test(value)) throw new Error('WORKFLOW_FIXTURE_SCOPE')
  const ids = value.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi) ?? []
  if (ids.some(id => !/^c1f5[0-9a-f]{4}-/i.test(id))) throw new Error('WORKFLOW_FIXTURE_SCOPE')
}
export function assertWorkflowTapResult(response) {
  if (!response || typeof response !== 'object' || !Array.isArray(response.rows)) throw new Error('WORKFLOW_TAP_INVALID')
  const values = response.rows.flatMap(row => row && typeof row === 'object' ? Object.values(row).filter(value => typeof value === 'string') : [])
  if (values.some(value => /^not ok\b|^Bail out!/m.test(value)) || response.rows.some(row => typeof row.finish === 'string' && row.finish.trim())) throw new Error('WORKFLOW_TAP_FAILED')
  const plans = values.flatMap(value => [...value.matchAll(/^1\.\.(\d+)\s*$/gm)].map(match => Number(match[1])))
  const assertions = values.flatMap(value => [...value.matchAll(/^ok\s+(\d+)\b/gm)].map(match => Number(match[1])))
  if (plans.length !== 1 || plans[0] < 1 || assertions.length !== plans[0] || new Set(assertions).size !== assertions.length || assertions.some((number, index) => number !== index + 1)) throw new Error('WORKFLOW_TAP_INVALID')
  return { assertions: assertions.length }
}
export function runCostWorkflowTests({ cwd = process.cwd(), env = process.env, files, assertTarget = assertCloudDevTarget, spawn = spawnSync } = {}) {
  const selected = files ?? costWorkflowSqlFiles.map(path => {
    const fullPath = resolve(cwd, 'supabase/tests/database/c1', path)
    if (!existsSync(fullPath)) throw new Error('WORKFLOW_TEST_FILE_MISSING')
    return { path, sql: readFileSync(fullPath, 'utf8') }
  })
  for (const file of selected) validateCostWorkflowSql(file.path, file.sql)
  assertTarget({ cwd, env })
  const cliEnv = isolatedSupabaseEnvironment(cwd, env, process.platform)
  const cli = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
  for (const file of selected) {
    const result = spawn(process.execPath, [cli, 'db', 'query', '--linked', '--output-format', 'json', '--file', resolve(cwd, 'supabase/tests/database/c1', file.path)], { cwd, env: cliEnv, encoding: 'utf8', timeout: 120000 })
    if (result.status !== 0) throw new Error('WORKFLOW_CLOUD_TEST_FAILED: ' + file.path)
    let response
    try { response = JSON.parse(String(result.stdout ?? '')) } catch { throw new Error('WORKFLOW_TAP_INVALID') }
    const counts = assertWorkflowTapResult(response)
    console.log(file.path + ': ' + counts.assertions + ' assertions passed')
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCostWorkflowTests()
