import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { bootstrapB4Acceptance, finalizeB4Acceptance } from '../../../scripts/stage01-b4-acceptance-fixture.mjs'
import { B4_EVIDENCE_PATH, B4_RESULTS_DIRECTORY, B4_SECRET_STATE_PATH, toB4AcceptanceEvidence, type B4AcceptanceState } from './acceptance-state'

type SetupDependencies = {
  cwd: () => string
  bootstrap: (input: { cwd: string }) => Promise<B4AcceptanceState>
  makeResultsDirectory: (cwd: string) => Promise<void>
  writeSecretState: (cwd: string, state: B4AcceptanceState) => Promise<void>
  chmodSecretState: (cwd: string) => Promise<void>
  writeEvidence: (cwd: string, state: B4AcceptanceState) => Promise<void>
  finalize: (input: { cwd: string, state: B4AcceptanceState }) => Promise<void>
  removeSecretState: (cwd: string) => Promise<void>
}

function rethrowFailures(failures: unknown[], message: string): never {
  if (failures.length === 1) throw failures[0]
  throw new AggregateError(failures, message)
}

const defaults: SetupDependencies = {
  cwd: () => process.cwd(),
  bootstrap: bootstrapB4Acceptance,
  makeResultsDirectory: async cwd => { await mkdir(resolve(cwd, B4_RESULTS_DIRECTORY), { recursive: true }) },
  writeSecretState: async (cwd, state) => { await writeFile(resolve(cwd, B4_SECRET_STATE_PATH), `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 }) },
  chmodSecretState: async cwd => { await chmod(resolve(cwd, B4_SECRET_STATE_PATH), 0o600) },
  writeEvidence: async (cwd, state) => { await writeFile(resolve(cwd, B4_EVIDENCE_PATH), `${JSON.stringify(toB4AcceptanceEvidence(state))}\n`, 'utf8') },
  finalize: finalizeB4Acceptance,
  removeSecretState: async cwd => { await rm(resolve(cwd, B4_SECRET_STATE_PATH), { force: true }) },
}

export function createGlobalSetup(overrides: Partial<SetupDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function globalSetup() {
    const cwd = dependencies.cwd()
    const state = await dependencies.bootstrap({ cwd })
    try {
      await dependencies.makeResultsDirectory(cwd)
      await dependencies.writeSecretState(cwd, state)
      await dependencies.chmodSecretState(cwd)
      await dependencies.writeEvidence(cwd, state)
    } catch (error) {
      const failures: unknown[] = [error]
      try { await dependencies.finalize({ cwd, state }) } catch (cleanupError) { failures.push(cleanupError) }
      try { await dependencies.removeSecretState(cwd) } catch (removeError) { failures.push(removeError) }
      rethrowFailures(failures, 'B4 acceptance setup persistence and cleanup failed')
    }
  }
}

export default createGlobalSetup()
