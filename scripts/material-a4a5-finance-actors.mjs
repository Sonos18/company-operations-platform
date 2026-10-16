import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCloudDevFixtureQuery } from './cloud-dev-fixture-query.mjs'

// Only these existing Cloud DEV accounts may be granted the A1 Alpha finance roles.
const approvedAccountantEmail = 'ketoan@vqh.com'
const approvedTreasurerEmail = 'thuquy@vqh.com'

function renderFixture(template, env) {
  const accountantEmail = (env.A4A5_ACCOUNTANT_EMAIL ?? approvedAccountantEmail).trim().toLowerCase()
  const treasurerEmail = (env.A4A5_TREASURER_EMAIL ?? approvedTreasurerEmail).trim().toLowerCase()
  if (accountantEmail !== approvedAccountantEmail || treasurerEmail !== approvedTreasurerEmail) {
    throw new Error('A4/A5 finance actor emails must match approved Cloud DEV accounts')
  }
  for (const marker of ['__A4A5_ACCOUNTANT_EMAIL__', '__A4A5_TREASURER_EMAIL__']) {
    if (template.split(marker).length !== 2) throw new Error('A4/A5 finance fixture SQL template marker is missing or repeated')
  }
  return template.replace('__A4A5_ACCOUNTANT_EMAIL__', accountantEmail).replace('__A4A5_TREASURER_EMAIL__', treasurerEmail)
}

/** @param {import('./cloud-dev-fixture-query.mjs').CloudDevFixtureOptions} [options] */
export function runMaterialA4A5FinanceActors({ cwd = process.cwd(), env = process.env, ...options } = {}) {
  const template = readFileSync(resolve(cwd, 'supabase/fixtures/material-a4a5-finance-actors.sql'), 'utf8')
  const sql = renderFixture(template, env)
  runCloudDevFixtureQuery(sql, { label: 'A4/A5 finance actors', cwd, env, ...options })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--execute') throw new Error('A4/A5 finance actors fixture requires --execute')
  runMaterialA4A5FinanceActors()
  console.log('A4/A5 finance actors granted in A1 Alpha DEV; sign in again and switch to "A1 Alpha Test Company"')
}
