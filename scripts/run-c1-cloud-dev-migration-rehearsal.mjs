import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'

const migrationPattern = /^20260918102344_c1_project_cost_detail_schema_reconciliation\.sql$/u

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
  const migrations = readdirSync(resolve(cwd, 'supabase/migrations')).filter(name => migrationPattern.test(name))
  if (migrations.length !== 1) throw new Error('C1 migration rehearsal requires exactly one reconciliation migration')
  return readFileSync(resolve(cwd, 'supabase/migrations', migrations[0]), 'utf8')
}

export function runC1MigrationRehearsal({
  cwd = process.cwd(),
  migrationSql = readC1MigrationSql(cwd),
  assertTarget = assertCloudDevTarget,
  spawn = spawnSync,
} = {}) {
  const sql = buildC1MigrationRehearsalSql(migrationSql)
  validateC1MigrationRehearsalSql(sql)
  assertTarget({ cwd })
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'taskovia-c1-rehearsal-'))
  const temporaryFile = join(temporaryDirectory, 'migration.sql')
  try {
    writeFileSync(temporaryFile, sql, 'utf8')
    const cli = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
    const result = spawn(process.execPath, [cli, 'db', 'query', '--linked', '--file', temporaryFile], { cwd, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error('C1 Cloud DEV migration rehearsal failed')
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runC1MigrationRehearsal()
