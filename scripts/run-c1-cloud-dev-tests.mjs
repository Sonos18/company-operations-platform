import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'

const allowlist = ['c1_foundation.test.sql']

export function validateC1CloudDevSql(path, sql) {
  const normalized = sql.replace(/\r\n?/g, '\n').trim()
  if (!allowlist.includes(path)) throw new Error('Unknown C1 SQL verification file')
  if (!/^begin\s*;/iu.test(normalized) || !/rollback\s*;$/iu.test(normalized)) throw new Error('C1 SQL verification must start with begin and end with rollback')
  if (/\bcommit\s*;/iu.test(normalized)) throw new Error('C1 SQL verification cannot commit')
  if (/\b(db\s+reset|migration\s+repair|supabase_migrations|seed|include-seed)\b/iu.test(normalized)) throw new Error('C1 SQL contains a forbidden Cloud DEV operation')
  if (/\bVQH\b|10000000-0000-4000-8000-0000000000/iu.test(normalized)) throw new Error('C1 SQL cannot reference real VQH identifiers')
}

export function runC1CloudDevTests({ cwd = process.cwd(), files, spawn = spawnSync } = {}) {
  const selected = files ?? allowlist.filter(path => existsSync(resolve(cwd, 'supabase/tests/database/c1', path))).map(path => ({ path, sql: readFileSync(resolve(cwd, 'supabase/tests/database/c1', path), 'utf8') }))
  if (selected.length !== allowlist.length) throw new Error('Missing C1 SQL verification file')
  for (const file of selected) validateC1CloudDevSql(file.path, file.sql)
  assertCloudDevTarget({ cwd })
  const cli = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
  for (const file of selected) {
    const result = spawn(process.execPath, [cli, 'db', 'query', '--linked', '--file', resolve(cwd, 'supabase/tests/database/c1', file.path)], { cwd, stdio: 'inherit' })
    if (result.status !== 0) throw new Error('C1 Cloud DEV SQL verification failed')
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) runC1CloudDevTests()
