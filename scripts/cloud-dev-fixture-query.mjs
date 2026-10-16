import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'
import { isolatedSupabaseEnvironment } from './run-supabase-dev.mjs'

/**
 * @typedef {{
 *   cwd?: string,
 *   env?: NodeJS.ProcessEnv,
 *   platform?: NodeJS.Platform,
 *   assertTarget?: (options: { cwd: string, env: NodeJS.ProcessEnv }) => void,
 *   createCliEnvironment?: (cwd: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform) => NodeJS.ProcessEnv,
 *   spawn?: (command: string, args: string[], options: { cwd: string, env: NodeJS.ProcessEnv, encoding: 'utf8', timeout: number }) => { status: number | null, stdout: string, stderr: string, error?: Error },
 * }} CloudDevFixtureOptions
 */

/**
 * Runs one rendered fixture SQL file against the linked Cloud DEV project with the dedicated
 * Supabase CLI environment. The SQL owns its transaction; a non-zero exit means it rolled back.
 * @param {string} sql
 * @param {CloudDevFixtureOptions & { label: string }} options
 */
export function runCloudDevFixtureQuery(sql, {
  label, cwd = process.cwd(), env = process.env, platform = process.platform,
  assertTarget = assertCloudDevTarget, createCliEnvironment = isolatedSupabaseEnvironment, spawn = spawnSync,
}) {
  assertTarget({ cwd, env })
  const cliEnvironment = createCliEnvironment(cwd, env, platform)
  const directory = mkdtempSync(join(tmpdir(), 'taskovia-fixture-'))
  try {
    const file = join(directory, 'fixture.sql')
    writeFileSync(file, sql, { encoding: 'utf8', mode: 0o600 })
    const cli = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
    const result = spawn(process.execPath, [cli, 'db', 'query', '--linked', '--output-format', 'json', '--file', file], {
      cwd, env: cliEnvironment, encoding: 'utf8', timeout: 120_000,
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`${label} Cloud DEV fixture transaction failed; stop without retry`)
    return result.stdout
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
