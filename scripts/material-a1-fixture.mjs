import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'
import { isolatedSupabaseEnvironment } from './run-supabase-dev.mjs'

const emailPattern = /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

function renderFixture(template, env) {
  const engineerEmail = env.A1_ENGINEER_EMAIL?.trim().toLowerCase()
  const buyerEmail = env.A1_BUYER_EMAIL?.trim().toLowerCase()
  if (!emailPattern.test(engineerEmail ?? '') || !emailPattern.test(buyerEmail ?? '') || engineerEmail === buyerEmail) {
    throw new Error('A1 fixture actor emails are missing, equal or invalid')
  }
  if (engineerEmail !== 'kysu@vqh.com' || buyerEmail !== 'muahang@vqh.com') {
    throw new Error('A1 fixture actor emails must match approved Cloud DEV accounts')
  }
  for (const marker of ['__A1_ENGINEER_EMAIL__', '__A1_BUYER_EMAIL__']) {
    if (template.split(marker).length !== 2) throw new Error('A1 fixture SQL template marker is missing or repeated')
  }
  return template.replace('__A1_ENGINEER_EMAIL__', engineerEmail).replace('__A1_BUYER_EMAIL__', buyerEmail)
}

export function runMaterialA1Fixture({
  cwd = process.cwd(), env = process.env, platform = process.platform,
  assertTarget = assertCloudDevTarget, createCliEnvironment = isolatedSupabaseEnvironment, spawn = spawnSync,
} = {}) {
  const template = readFileSync(resolve(cwd, 'supabase/fixtures/material-a1-alpha.sql'), 'utf8')
  const sql = renderFixture(template, env)
  assertTarget({ cwd, env })
  const cliEnvironment = createCliEnvironment(cwd, env, platform)
  const directory = mkdtempSync(join(tmpdir(), 'taskovia-a1-fixture-'))
  try {
    const file = join(directory, 'fixture.sql')
    writeFileSync(file, sql, { encoding: 'utf8', mode: 0o600 })
    const cli = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
    const result = spawn(process.execPath, [cli, 'db', 'query', '--linked', '--output-format', 'json', '--file', file], {
      cwd, env: cliEnvironment, encoding: 'utf8', timeout: 120_000,
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error('A1 Cloud DEV fixture transaction failed; stop without retry')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--execute') throw new Error('A1 fixture requires --execute')
  runMaterialA1Fixture()
  console.log('A1 Cloud DEV fixture command completed; verify canonical read before acceptance')
}
