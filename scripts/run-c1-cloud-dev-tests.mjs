import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isolatedSupabaseEnvironment } from './run-supabase-dev.mjs'
import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'

const allowlist = [
  'c1_foundation.test.sql',
  'c1_controlled_import_commands.test.sql',
  'c1_controlled_import_security.test.sql',
  'c1_audited_source_ownership_correction.test.sql',
  'c1_project_cost_items.test.sql',
  'c1_project_cost_item_details.test.sql',
  'c1_project_finance_metadata_read.test.sql',
  'c1_project_finance_operational_state_read.test.sql',
  'c1_completed_projects.test.sql',
  'c1_accounting_write_lifecycle.test.sql',
  'c1_accounting_write_evidence.test.sql',
  'c1_accounting_write_cash.test.sql',
  'c1_ordinary_cost_detail_lifecycle_foundation.test.sql',
  'c1_ordinary_cost_detail_commands.test.sql',
  'c1_ordinary_cost_detail_provenance_evidence_reads.test.sql',
]

const materialAllowlist = [
  'c1_material_procurement_a1.test.sql',
]

const accountingWriteSyntheticPrefixes = {
  'c1_accounting_write_lifecycle.test.sql': 'c106',
  'c1_accounting_write_evidence.test.sql': 'c107',
  'c1_accounting_write_cash.test.sql': 'c108',
}

const ordinaryCostDetailSyntheticPrefixes = {
  'c1_completed_projects.test.sql': 'c1f4',
  'c1_ordinary_cost_detail_lifecycle_foundation.test.sql': 'c1f1',
  'c1_ordinary_cost_detail_commands.test.sql': 'c1d1',
  'c1_ordinary_cost_detail_provenance_evidence_reads.test.sql': 'c1f3',
}

export function validateC1CloudDevSql(path, sql) {
  const normalized = sql.replace(/\r\n?/g, '\n').trim()
  if (![...allowlist, ...materialAllowlist].includes(path)) throw new Error('Unknown C1 SQL verification file')
  if (!/^begin\s*;/iu.test(normalized) || !/rollback\s*;$/iu.test(normalized)) throw new Error('C1 SQL verification must start with begin and end with rollback')
  if (/\bcommit\s*;/iu.test(normalized)) throw new Error('C1 SQL verification cannot commit')
  if (/\b(db\s+reset|migration\s+repair|supabase_migrations|seed|include-seed)\b/iu.test(normalized)) throw new Error('C1 SQL contains a forbidden Cloud DEV operation')
  if (/\b(?:select|perform|call)\s+(?:public\.(?:c1_(?:create_project_cost_draft|update_project_cost_draft|prepare_project_cost_financials|read_project_cost_draft|list_project_cost_drafts|read_project_cost_draft_operational|list_project_cost_drafts_operational|publish_project_cost|create_project_cost_item|update_project_cost_item))|private\.(?:c1_(?:create_project_cost_draft|update_project_cost_draft|prepare_project_cost_financials|read_project_cost_draft|list_project_cost_drafts|read_project_cost_draft_operational|list_project_cost_drafts_operational|publish_project_cost|project_cost_draft_json|project_cost_draft_operational_json|project_cost_publish_readiness)))\s*\(/iu.test(normalized)) throw new Error('C1 SQL calls a retired parent draft RPC')
  if (/\bVQH\b|10000000-0000-4000-8000-0000000000/iu.test(normalized)) throw new Error('C1 SQL cannot reference real VQH identifiers')
  const materialPrefix = path === 'c1_material_procurement_a1.test.sql' ? 'c122' : undefined
  if (materialPrefix) {
    const ids = normalized.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
    if (ids.some(id => !id.toLowerCase().startsWith(materialPrefix))) throw new Error('Material SQL must use reserved synthetic UUIDs')
  }
  if (path === 'c1_audited_source_ownership_correction.test.sql') {
    const ids = normalized.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
    if (ids.some(id => !/^c10[23][0-9a-f]{4}-/iu.test(id))) throw new Error('Audited source ownership SQL must use reserved synthetic UUIDs')
  }
  if (path === 'c1_project_cost_items.test.sql' || path === 'c1_project_cost_item_details.test.sql') {
    const ids = normalized.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
    if (ids.some(id => !/^c10[01][0-9a-f]{4}-/iu.test(id))) throw new Error('Project Cost SQL must use reserved synthetic UUIDs')
    if (path === 'c1_project_cost_item_details.test.sql' && !ids.some(id => /^c101[0-9a-f]{4}-/iu.test(id))) throw new Error('Project Cost Detail SQL must include c101 synthetic fixture identifiers')
    if (/\b(?:Eo\s+Gi\p{L}*|Yong\s+Mei)\b/iu.test(normalized)) throw new Error('Project Cost SQL cannot reference real VQH names')
  }
  if (path === 'c1_project_finance_metadata_read.test.sql') {
    const ids = normalized.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
    if (ids.some(id => !/^c104[0-9a-f]{4}-/iu.test(id))) throw new Error('Finance metadata SQL must use reserved c104 synthetic UUIDs')
  }
  if (path === 'c1_project_finance_operational_state_read.test.sql') {
    const ids = normalized.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
    if (ids.some(id => !/^c105[0-9a-f]{4}-/iu.test(id))) throw new Error('Finance lifecycle SQL must use reserved c105 synthetic UUIDs')
  }
  const accountingWritePrefix = accountingWriteSyntheticPrefixes[path]
  if (accountingWritePrefix) {
    const ids = normalized.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
    if (ids.some(id => !id.toLowerCase().startsWith(accountingWritePrefix))) throw new Error(`${path} must use reserved synthetic UUIDs`)
  }
  const ordinaryCostDetailPrefix = ordinaryCostDetailSyntheticPrefixes[path]
  if (ordinaryCostDetailPrefix) {
    const ids = normalized.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu) ?? []
    if (ids.some(id => !id.toLowerCase().startsWith(ordinaryCostDetailPrefix))) throw new Error(`${path} must use reserved synthetic UUIDs`)
    if (/\b(?:Eo\s+Gi\p{L}*|Yong\s+Mei)\b/iu.test(normalized)) throw new Error('C1 ordinary detail SQL cannot reference real VQH/customer identifiers')
  }
}

function assertC1CloudDevPgTapResult(path, stdout) {
  const payloadStart = stdout.indexOf('{')
  if (payloadStart < 0) throw new Error(`C1 Cloud DEV SQL verification failed for ${path}: Supabase CLI returned no JSON result`)

  let response
  try {
    response = JSON.parse(stdout.slice(payloadStart))
  } catch {
    throw new Error(`C1 Cloud DEV SQL verification failed for ${path}: Supabase CLI returned invalid JSON`)
  }
  if (!response || typeof response !== 'object' || Array.isArray(response) || !Array.isArray(response.rows)) {
    throw new Error(`C1 Cloud DEV SQL verification failed for ${path}: Supabase CLI returned an invalid query result`)
  }

  const finish = response.rows.find(row => row && typeof row === 'object' && !Array.isArray(row) && typeof row.finish === 'string')?.finish
  if (finish) throw new Error(`C1 Cloud DEV SQL verification failed for ${path}: pgTAP finish reported a diagnostic`)
  if (path === 'c1_material_procurement_a1.test.sql' && !response.rows.some(row => row?.result === 'A1_MATERIAL_PGTAP_COMPLETE' && (row.finish_count === 0 || row.finish_count === '0'))) {
    throw new Error('A1 Cloud DEV SQL verification returned no pgTAP completion evidence')
  }
}

export function runC1CloudDevTests({ cwd = process.cwd(), files, env = process.env, platform = process.platform, spawn = spawnSync, assertTarget = assertCloudDevTarget, createCliEnvironment = isolatedSupabaseEnvironment } = {}) {
  const selected = files ?? allowlist.filter(path => existsSync(resolve(cwd, 'supabase/tests/database/c1', path))).map(path => ({ path, sql: readFileSync(resolve(cwd, 'supabase/tests/database/c1', path), 'utf8') }))
  if (!files && selected.length !== allowlist.length) throw new Error('Missing C1 SQL verification file')
  for (const file of selected) validateC1CloudDevSql(file.path, file.sql)
  assertTarget({ cwd, env })
  const cliEnvironment = createCliEnvironment(cwd, env, platform)
  const cli = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
  for (const file of selected) {
    const result = spawn(process.execPath, [cli, 'db', 'query', '--linked', '--output-format', 'json', '--file', resolve(cwd, 'supabase/tests/database/c1', file.path)], { cwd, encoding: 'utf8', env: cliEnvironment })
    const stdout = String(result.stdout ?? '')
    const stderr = String(result.stderr ?? '')
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
    if (result.status !== 0) throw new Error(`C1 Cloud DEV SQL verification failed for ${file.path}`)
    assertC1CloudDevPgTapResult(file.path, stdout)
  }
}

// Rehearse the exact pending migration and synthetic policy test in one session.
// No migration history or schema/data changes survive the final rollback.
export function runCompletedProjectsRehearsal({ cwd = process.cwd(), env = process.env, spawn = spawnSync, assertTarget = assertCloudDevTarget } = {}) {
  const path = 'c1_completed_projects.test.sql'
  const fixture = readFileSync(resolve(cwd, 'supabase/tests/database/c1', path), 'utf8')
  validateC1CloudDevSql(path, fixture)
  const migration = readFileSync(resolve(cwd, 'supabase/migrations/20261003065632_completed_projects_readonly.sql'), 'utf8')
  const sql = 'begin;\n' + migration + '\n' + fixture.trim().replace(/^begin\s*;/iu, '').replace(/rollback\s*;$/iu, '') + "\nselect 'C1_COMPLETED_PROJECTS_REHEARSAL_COMPLETE' as result;\nrollback;\n"
  validateC1CloudDevSql(path, sql)
  assertTarget({ cwd, env })
  const cliEnvironment = isolatedSupabaseEnvironment(cwd, env, process.platform)
  const directory = mkdtempSync(join(tmpdir(), 'taskovia-completed-rehearsal-'))
  try {
    const queryFile = join(directory, 'rehearsal.sql')
    writeFileSync(queryFile, sql, { mode: 0o600 })
    const cli = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
    const result = spawn(process.execPath, [cli, 'db', 'query', '--linked', '--output-format', 'json', '--file', queryFile], { cwd, encoding: 'utf8', timeout: 120_000, env: cliEnvironment })
    const stdout = String(result.stdout ?? '')
    const stderr = String(result.stderr ?? '')
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
    if (result.status !== 0) throw new Error('Completed-project Cloud DEV rehearsal failed; the database transaction is rolled back on disconnect')
    const response = JSON.parse(stdout)
    const rows = Array.isArray(response) ? response : response?.rows
    if (!Array.isArray(rows) || !rows.some(row => row?.result === 'C1_COMPLETED_PROJECTS_REHEARSAL_COMPLETE')) {
      throw new Error('Completed-project rehearsal returned no completion evidence')
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export function runMaterialCloudDevTests({ cwd = process.cwd(), run = runC1CloudDevTests } = {}) {
  const files = materialAllowlist.map(path => ({ path, sql: readFileSync(resolve(cwd, 'supabase/tests/database/c1', path), 'utf8') }))
  return run({ cwd, files })
}

export function isC1CloudDevCliInvocation({ argv = process.argv, moduleUrl = import.meta.url } = {}) {
  return typeof argv[1] === 'string' && resolve(argv[1]) === fileURLToPath(moduleUrl)
}

export function runC1CloudDevCli({ argv = process.argv, moduleUrl = import.meta.url, run = runC1CloudDevTests, rehearse = runCompletedProjectsRehearsal, materials = runMaterialCloudDevTests } = {}) {
  if (!isC1CloudDevCliInvocation({ argv, moduleUrl })) return false
  const args = argv.slice(2)
  if (args.length === 1 && args[0] === '--completed-projects-rehearsal') rehearse()
  else if (args.length === 1 && args[0] === '--materials') materials()
  else if (args.length === 0) run()
  else throw new Error('Unknown C1 Cloud DEV verification arguments')
  return true
}

runC1CloudDevCli()
