import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertCanonicalVqhHasNoRunMarker, finalizeB4AcceptanceRecovery, readB4AuthoritativeCleanupMetadata } from '../../../scripts/stage01-b4-acceptance-fixture.mjs'
import { B4_SECRET_STATE_PATH } from './acceptance-state'

type TeardownDependencies = {
  cwd: () => string
  readAuthoritativeMetadata: (input: { cwd: string }) => Promise<{ runMarker: string }>
  assertCanonical: (input: { cwd: string, runMarker: string }) => Promise<void>
  finalizeFixedActors: (input: { cwd: string }) => Promise<void>
  removeSecretState: (cwd: string) => Promise<void>
}

function rethrowFailures(failures: unknown[], message: string): never {
  if (failures.length === 1) throw failures[0]
  throw new AggregateError(failures, message)
}

const defaults: TeardownDependencies = {
  cwd: () => process.cwd(),
  readAuthoritativeMetadata: readB4AuthoritativeCleanupMetadata,
  assertCanonical: assertCanonicalVqhHasNoRunMarker,
  finalizeFixedActors: finalizeB4AcceptanceRecovery,
  removeSecretState: async cwd => { await rm(resolve(cwd, B4_SECRET_STATE_PATH), { force: true }) },
}

export function createGlobalTeardown(overrides: Partial<TeardownDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function globalTeardown() {
    const cwd = dependencies.cwd()
    const failures: unknown[] = []
    try {
      const metadata = await dependencies.readAuthoritativeMetadata({ cwd })
      try { await dependencies.assertCanonical({ cwd, runMarker: metadata.runMarker }) } catch (error) { failures.push(error) }
    } catch (error) { failures.push(error) }
    try { await dependencies.finalizeFixedActors({ cwd }) } catch (error) { failures.push(error) }
    try { await dependencies.removeSecretState(cwd) } catch (error) { failures.push(error) }
    if (failures.length > 0) rethrowFailures(failures, 'B4 acceptance teardown failed')
  }
}

export default createGlobalTeardown()
