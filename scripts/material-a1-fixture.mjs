import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCloudDevFixtureQuery } from './cloud-dev-fixture-query.mjs'

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

/** @param {import('./cloud-dev-fixture-query.mjs').CloudDevFixtureOptions} [options] */
export function runMaterialA1Fixture({ cwd = process.cwd(), env = process.env, ...options } = {}) {
  const template = readFileSync(resolve(cwd, 'supabase/fixtures/material-a1-alpha.sql'), 'utf8')
  const sql = renderFixture(template, env)
  runCloudDevFixtureQuery(sql, { label: 'A1', cwd, env, ...options })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--execute') throw new Error('A1 fixture requires --execute')
  runMaterialA1Fixture()
  console.log('A1 Cloud DEV fixture command completed; verify canonical read before acceptance')
}
