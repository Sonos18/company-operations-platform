import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { bootstrapB4Acceptance } from '../../../scripts/stage01-b4-acceptance-fixture.mjs'
import { B4_EVIDENCE_PATH, B4_RESULTS_DIRECTORY, B4_SECRET_STATE_PATH, toB4AcceptanceEvidence } from './acceptance-state'

export default async function globalSetup() {
  const cwd = process.cwd()
  const state = await bootstrapB4Acceptance({ cwd })
  await mkdir(resolve(cwd, B4_RESULTS_DIRECTORY), { recursive: true })
  await writeFile(resolve(cwd, B4_SECRET_STATE_PATH), `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 })
  await chmod(resolve(cwd, B4_SECRET_STATE_PATH), 0o600)
  await writeFile(resolve(cwd, B4_EVIDENCE_PATH), `${JSON.stringify(toB4AcceptanceEvidence(state))}\n`, 'utf8')
}
