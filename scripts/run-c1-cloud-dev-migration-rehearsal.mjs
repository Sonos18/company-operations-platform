import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'

const migrationSuffixes = [
  '_c1_draft_list_parent_eligibility.sql',
]

export function buildC1MigrationRehearsalSql(migrationSql) {
  const normalized = migrationSql.replace(/\r\n?/g, '\n').trim()
  if (!normalized) throw new Error('C1 migration rehearsal requires migration SQL')
  if (/\b(?:begin|commit|rollback)\s*;/iu.test(normalized)) throw new Error('C1 migration rehearsal cannot contain transaction control')
  return 'begin;\n' + normalized + '\nrollback;\n'
}

export function validateC1MigrationRehearsalSql(sql) {
  const normalized = sql.replace(/\r\n?/g, '\n').trim()
  if (!/^begin\s*;/iu.test(normalized) || !/rollback\s*;$/iu.test(normalized)) throw new Error('C1 migration rehearsal must start with begin and end with rollback')
  if (/\bcommit\s*;/iu.test(normalized)) throw new Error('C1 migration rehearsal cannot commit')
}

export function readC1MigrationSql(cwd = process.cwd()) {
  const directory = resolve(cwd, 'supabase/migrations')
  const names = readdirSync(directory)
  const migrations = migrationSuffixes.map(suffix => {
    const matches = names.filter(name => name.endsWith(suffix))
    if (matches.length !== 1) throw new Error(`C1 migration rehearsal requires exactly one migration for ${suffix}`)
    return matches[0]
  }).sort()
  return migrations.map(name => readFileSync(resolve(directory, name), 'utf8')).join('\n')
}

// Replay the exact migration guard, replacing only its two relation names.
// The fixture creates temporary tables only; no production rows are fabricated.
export function readC1HistoryRehearsalSql(cwd, migrationSql) {
  const guards = migrationSql.match(/do \$c1_cost_history_preflight\$[\s\S]*?\$c1_cost_history_preflight\$;/gu) ?? []
  if (guards.length !== 1) throw new Error('C1 history rehearsal requires exactly one production preflight')
  const guard = guards[0]
    .replaceAll('public.project_cost_item_details', 'pg_temp.c1_history_details')
    .replaceAll('public.project_cost_items', 'pg_temp.c1_history_parents')
  if (/\bpublic\./u.test(guard)) throw new Error('C1 history rehearsal cannot access production relations')
  const fixture = readFileSync(resolve(cwd, 'supabase/tests/rehearsal/c1_published_cost_history.sql'), 'utf8')
  const marker = '-- C1_HISTORY_PREFLIGHT_BODY'
  if (fixture.split(marker).length !== 2) throw new Error('C1 history rehearsal requires exactly one preflight marker')
  return fixture.replace(marker, () => guard)
}

export function runC1MigrationRehearsal({
  cwd = process.cwd(),
  migrationSql = readC1MigrationSql(cwd),
  assertTarget = assertCloudDevTarget,
  spawn = spawnSync,
} = {}) {
  validateC1MigrationRehearsalSql(buildC1MigrationRehearsalSql(migrationSql))
  assertTarget({ cwd })
  const historySql = readC1HistoryRehearsalSql(cwd, migrationSql)
  const sql = buildC1MigrationRehearsalSql(`${migrationSql}\n${historySql}`)
  validateC1MigrationRehearsalSql(sql)
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'taskovia-c1-rehearsal-'))
  const temporaryFile = join(temporaryDirectory, 'migration.sql')
  try {
    writeFileSync(temporaryFile, sql, 'utf8')
    const cli = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
    const result = spawn(process.execPath, [cli, 'db', 'query', '--linked', '--output-format', 'json', '--file', temporaryFile], { cwd, encoding: 'utf8' })
    if (result.error) throw result.error
    if (result.status !== 0) {
      if (result.stderr) process.stderr.write(String(result.stderr))
      throw new Error('C1 Cloud DEV migration rehearsal failed')
    }
    let response
    try {
      const stdout = String(result.stdout ?? '')
      response = JSON.parse(stdout.slice(stdout.indexOf('{')))
    } catch {
      throw new Error('C1 Cloud DEV migration rehearsal returned no valid completion evidence')
    }
    if (!Array.isArray(response?.rows) || !response.rows.some(row => row?.result === 'C1_PUBLISHED_COST_HISTORY_REHEARSAL_COMPLETE')) {
      throw new Error('C1 Cloud DEV migration rehearsal returned no valid completion evidence')
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runC1MigrationRehearsal()
