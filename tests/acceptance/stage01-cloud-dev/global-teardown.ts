import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertCanonicalVqhHasNoRunMarker, finalizeB4Acceptance } from '../../../scripts/stage01-b4-acceptance-fixture.mjs'
import { B4_SECRET_STATE_PATH, readB4AcceptanceState } from './acceptance-state'

export default async function globalTeardown() {
  const cwd = process.cwd()
  let state
  try {
    state = await readB4AcceptanceState(cwd)
    await assertCanonicalVqhHasNoRunMarker({ cwd, runMarker: state.runMarker })
    await finalizeB4Acceptance({ cwd, state })
  } finally {
    await rm(resolve(cwd, B4_SECRET_STATE_PATH), { force: true })
  }
}
