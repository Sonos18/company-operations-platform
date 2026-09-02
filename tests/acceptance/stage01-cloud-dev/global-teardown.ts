import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertCanonicalVqhHasNoRunMarker, finalizeB4Acceptance } from '../../../scripts/stage01-b4-acceptance-fixture.mjs'
import { B4_SECRET_STATE_PATH, readB4AcceptanceState, type B4AcceptanceState } from './acceptance-state'

type TeardownDependencies = {
  cwd: () => string
  readState: (cwd: string) => Promise<B4AcceptanceState>
  assertCanonical: (input: { cwd: string, runMarker: string }) => Promise<void>
  finalize: (input: { cwd: string, state: B4AcceptanceState }) => Promise<void>
  removeSecretState: (cwd: string) => Promise<void>
}

function rethrowFailures(failures: unknown[], message: string): never {
  if (failures.length === 1) throw failures[0]
  throw new AggregateError(failures, message)
}

const defaults: TeardownDependencies = {
  cwd: () => process.cwd(),
  readState: readB4AcceptanceState,
  assertCanonical: assertCanonicalVqhHasNoRunMarker,
  finalize: finalizeB4Acceptance,
  removeSecretState: async cwd => { await rm(resolve(cwd, B4_SECRET_STATE_PATH), { force: true }) },
}

export function createGlobalTeardown(overrides: Partial<TeardownDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function globalTeardown() {
    const cwd = dependencies.cwd()
    const failures: unknown[] = []
    let state: B4AcceptanceState | undefined
    try { state = await dependencies.readState(cwd) } catch (error) { failures.push(error) }
    if (state) {
      try { await dependencies.assertCanonical({ cwd, runMarker: state.runMarker }) } catch (error) { failures.push(error) }
      try { await dependencies.finalize({ cwd, state }) } catch (error) { failures.push(error) }
    }
    try { await dependencies.removeSecretState(cwd) } catch (error) { failures.push(error) }
    if (failures.length > 0) rethrowFailures(failures, 'B4 acceptance teardown failed')
  }
}

export default createGlobalTeardown()
