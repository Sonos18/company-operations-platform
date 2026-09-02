import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertCanonicalVqhHasNoRunMarker, finalizeB4Acceptance, finalizeB4AcceptanceRecovery } from '../../../scripts/stage01-b4-acceptance-fixture.mjs'
import { B4_SECRET_STATE_PATH, readB4AcceptanceEvidence, readB4AcceptanceState, type B4AcceptanceEvidence, type B4AcceptanceState } from './acceptance-state'

type TeardownDependencies = {
  cwd: () => string
  readState: (cwd: string) => Promise<B4AcceptanceState>
  readEvidence: (cwd: string) => Promise<B4AcceptanceEvidence>
  assertCanonical: (input: { cwd: string, runMarker: string }) => Promise<void>
  finalize: (input: { cwd: string, state: B4AcceptanceState }) => Promise<void>
  finalizeRecovery: (input: { cwd: string, evidence: B4AcceptanceEvidence }) => Promise<void>
  removeSecretState: (cwd: string) => Promise<void>
}

function rethrowFailures(failures: unknown[], message: string): never {
  if (failures.length === 1) throw failures[0]
  throw new AggregateError(failures, message)
}

const defaults: TeardownDependencies = {
  cwd: () => process.cwd(),
  readState: readB4AcceptanceState,
  readEvidence: readB4AcceptanceEvidence,
  assertCanonical: assertCanonicalVqhHasNoRunMarker,
  finalize: finalizeB4Acceptance,
  finalizeRecovery: finalizeB4AcceptanceRecovery,
  removeSecretState: async cwd => { await rm(resolve(cwd, B4_SECRET_STATE_PATH), { force: true }) },
}

export function createGlobalTeardown(overrides: Partial<TeardownDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function globalTeardown() {
    const cwd = dependencies.cwd()
    const failures: unknown[] = []
    let state: B4AcceptanceState | undefined
    try { state = await dependencies.readState(cwd) } catch (error) {
      failures.push(error)
      try {
        const evidence = await dependencies.readEvidence(cwd)
        try { await dependencies.assertCanonical({ cwd, runMarker: evidence.runMarker }) } catch (canonicalError) { failures.push(canonicalError) }
        try { await dependencies.finalizeRecovery({ cwd, evidence }) } catch (recoveryError) { failures.push(recoveryError) }
      } catch (evidenceError) { failures.push(evidenceError) }
    }
    if (state) {
      try { await dependencies.assertCanonical({ cwd, runMarker: state.runMarker }) } catch (error) { failures.push(error) }
      try { await dependencies.finalize({ cwd, state }) } catch (error) { failures.push(error) }
    }
    try { await dependencies.removeSecretState(cwd) } catch (error) { failures.push(error) }
    if (failures.length > 0) rethrowFailures(failures, 'B4 acceptance teardown failed')
  }
}

export default createGlobalTeardown()
