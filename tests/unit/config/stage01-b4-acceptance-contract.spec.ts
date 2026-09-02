import { existsSync, readFileSync } from 'node:fs'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createGlobalSetup } from '../../acceptance/stage01-cloud-dev/global-setup'
import { createGlobalTeardown } from '../../acceptance/stage01-cloud-dev/global-teardown'
import { assertB4ActorBoundary, assertRetainedProfileShape } from '../../../scripts/stage01-b4-acceptance-fixture.mjs'
import { B4_RESULTS_DIRECTORY, B4_SECRET_STATE_PATH } from '../../acceptance/stage01-cloud-dev/acceptance-state'

const root = resolve(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const state = {
  runMarker: 'b4-stage01-run', tenantId: 'b4000000-0000-4000-8000-000000000010',
  companyId: 'b4000000-0000-4000-8000-000000000020', companyCode: 'VQH_STAGE01_ACCEPTANCE' as const,
  acceptanceSnapshotId: 'b4000000-0000-4000-8000-000000000050',
  actors: {
    reader: { userId: 'reader', employeeId: 'reader-employee', email: 'reader@taskovia.invalid', password: 'secret' },
    operator: { userId: 'operator', employeeId: 'operator-employee', email: 'operator@taskovia.invalid', password: 'secret' },
    decision: { userId: 'decision', employeeId: 'decision-employee', email: 'decision@taskovia.invalid', password: 'secret' },
  },
  profiles: { p1OpportunityId: 'p1', p2OpportunityId: 'p2', p3OpportunityId: 'p3' },
}

describe('B4 Cloud DEV acceptance boundary', () => {
  it('keeps its fixed isolated identity, secret-state boundary, and real-browser contract', () => {
    const fixture = read('scripts/stage01-b4-acceptance-fixture.mjs')
    const state = read('tests/acceptance/stage01-cloud-dev/acceptance-state.ts')
    const setup = read('tests/acceptance/stage01-cloud-dev/global-setup.ts')
    const teardown = read('tests/acceptance/stage01-cloud-dev/global-teardown.ts')
    const config = read('playwright.b4.config.ts')
    const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }

    expect(fixture).toContain("'taskovia-b4-acceptance'")
    expect(fixture).toContain("'VQH_STAGE01_ACCEPTANCE'")
    expect(fixture).toContain("'b4000000-0000-4000-8000-000000000010'")
    expect(fixture).toContain("'b4000000-0000-4000-8000-000000000020'")
    expect(fixture).toContain('assertCloudDevTarget({ cwd })')
    expect(fixture).toContain('randomBytes')
    expect(state).toContain('acceptance-state.json')
    expect(state).toContain('acceptance-evidence.json')
    expect(setup).toContain('0o600')
    expect(teardown).toContain('dependencies.finalize')
    expect(config).toContain('4327')
    expect(config).toContain("testDir: './tests/acceptance/stage01-cloud-dev'")
    expect(config).toContain('timeout: 120_000')
    expect(config).toContain('pnpm dev --host 127.0.0.1 --port 4327')
    expect(packageJson.scripts['test:b4:cloud-dev']).toBe('playwright test --config=playwright.b4.config.ts')
  })

  it('forbids business-route replacement in full-stack acceptance specs', () => {
    const fullStackSpecs = [
      'tests/acceptance/stage01-cloud-dev/stage01-fullstack.spec.ts',
      'tests/acceptance/stage01-cloud-dev/stage01-performance.spec.ts',
    ].filter(path => existsSync(resolve(root, path)))

    for (const path of fullStackSpecs) {
      const source = read(path)
      expect(source).not.toContain('page.route(')
      expect(source).not.toContain('context.route(')
      expect(source).not.toContain('route.fulfill(')
    }
  })

  it('finalizes credentials before deleting secret state when canonical cleanliness fails', async () => {
    const calls: string[] = []
    const canonicalFailure = new Error('canonical marker')
    const teardown = createGlobalTeardown({
      cwd: () => root,
      readState: async () => state,
      assertCanonical: async () => { calls.push('canonical'); throw canonicalFailure },
      finalize: async () => { calls.push('finalize') },
      removeSecretState: async () => { calls.push('remove') },
    })

    await expect(teardown()).rejects.toBe(canonicalFailure)
    expect(calls).toEqual(['canonical', 'finalize', 'remove'])
  })

  it('finalizes and removes partial secret state when setup persistence fails', async () => {
    const calls: string[] = []
    const writeFailure = new Error('secret state write failed')
    const setup = createGlobalSetup({
      cwd: () => root,
      bootstrap: async () => state,
      makeResultsDirectory: async () => { calls.push('mkdir') },
      writeSecretState: async () => { calls.push('write-secret'); throw writeFailure },
      chmodSecretState: async () => { calls.push('chmod') },
      writeEvidence: async () => { calls.push('write-evidence') },
      finalize: async () => { calls.push('finalize') },
      removeSecretState: async () => { calls.push('remove') },
    })

    await expect(setup()).rejects.toBe(writeFailure)
    expect(calls).toEqual(['mkdir', 'write-secret', 'finalize', 'remove'])
  })

  it('removes a written secret-state file with the default setup cleanup dependency', async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), 'taskovia-b4-setup-'))
    const statePath = resolve(cwd, B4_SECRET_STATE_PATH)
    const chmodFailure = new Error('chmod failed')
    try {
      const setup = createGlobalSetup({
        cwd: () => cwd,
        bootstrap: async () => state,
        makeResultsDirectory: async directory => { await mkdir(resolve(directory, B4_RESULTS_DIRECTORY), { recursive: true }) },
        writeSecretState: async () => { await writeFile(statePath, 'secret-state', 'utf8') },
        chmodSecretState: async () => { throw chmodFailure },
        writeEvidence: async () => { throw new Error('evidence must not be written') },
        finalize: async () => {},
      })

      await expect(setup()).rejects.toBe(chmodFailure)
      await expect(access(statePath)).rejects.toThrow()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('rejects a reused actor with a canonical membership before credential rotation', () => {
    expect(() => assertB4ActorBoundary({
      memberships: [{ tenant_id: '10000000-0000-4000-8000-000000000010', company_id: '10000000-0000-4000-8000-000000000020' }],
      assignments: [],
    })).toThrow('B4 acceptance actor identity is already scoped outside B4')
  })

  it('reuses only a profile with its required source marker and P3 graph cardinalities', () => {
    const profile = {
      opportunity: { id: 'p3', primary_customer_name: 'B4 P3 performance profile [8e1abc74]', need_description: 'Retained B4 P3 profile anchored to 8e1abc74' },
      workflow: { subject_id: 'p3', definition_snapshot_id: 'snapshot' },
      nodes: [{ id: 'intake', node_key: '01.1' }, { id: 'evaluation', node_key: '01.2' }],
      executions: [{ id: 'intake-execution', node_instance_id: 'intake' }, ...Array.from({ length: 20 }, (_, index) => ({ id: `evaluation-${index + 1}`, node_instance_id: 'evaluation' }))],
      cycles: Array.from({ length: 20 }, (_, index) => ({ id: `cycle-${index + 1}`, node_execution_id: `evaluation-${index + 1}` })),
      evaluations: Array.from({ length: 20 }, (_, cycle) => Array.from({ length: 6 }, (_, index) => ({ decision_cycle_id: `cycle-${cycle + 1}`, revision: index === 5 ? 2 : 1 }))).flat(),
      recommendations: Array.from({ length: 20 }, (_, cycle) => [{ decision_cycle_id: `cycle-${cycle + 1}`, version: 1 }, { decision_cycle_id: `cycle-${cycle + 1}`, version: 2 }]).flat(),
      clarifications: Array.from({ length: 20 }, (_, index) => ({ decision_cycle_id: `cycle-${index + 1}` })),
      contacts: Array.from({ length: 20 }, (_, index) => ({ contact_id: `contact-${index + 1}` })),
    }

    expect(assertRetainedProfileShape({ key: 'P3', snapshotId: 'snapshot', profile })).toBe('p3')
    expect(() => assertRetainedProfileShape({ key: 'P3', snapshotId: 'snapshot', profile: { ...profile, contacts: profile.contacts.slice(0, 19) } })).toThrow('B4 acceptance P3 retained profile is invalid')
  })
})
