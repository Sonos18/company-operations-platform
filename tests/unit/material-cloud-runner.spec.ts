import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'

const cwd = process.cwd()
const scriptPath = resolve('scripts/run-c1-cloud-dev-tests.mjs')
const materialPaths = [
  'c1_material_procurement_security.test.sql',
  'c1_material_procurement_a1.test.sql',
  'c1_material_engineer_invoice_name.test.sql',
  'c1_material_finance_foundation.test.sql',
  'c1_material_contracts.test.sql',
  'c1_material_payments.test.sql',
  'c1_material_finance_reads.test.sql',
  'c1_material_finance_hardening.test.sql',
  'c1_material_finance_access.test.sql',
]

it('selects only rollback material SQL through the guarded C1 runner', async () => {
  const runner = await import('../../scripts/run-c1-cloud-dev-tests.mjs')
  expect(runner.runMaterialCloudDevTests).toBeTypeOf('function')

  const run = vi.fn()
  runner.runMaterialCloudDevTests({ cwd, run })
  expect(run).toHaveBeenCalledOnce()
  const [{ files }] = run.mock.calls[0]!
  expect(files.map((file: { path: string }) => file.path)).toEqual(materialPaths)
  for (const file of files) {
    expect(file.sql.trim()).toMatch(/^begin\s*;/i)
    expect(file.sql.trim()).toMatch(/rollback\s*;$/i)
  }

  const materials = vi.fn()
  const ordinary = vi.fn()
  expect(runner.runC1CloudDevCli({
    argv: ['node', scriptPath, '--materials'],
    moduleUrl: pathToFileURL(scriptPath).href,
    run: ordinary,
    materials,
  })).toBe(true)
  expect(materials).toHaveBeenCalledOnce()
  expect(ordinary).not.toHaveBeenCalled()
})

it('accepts every material file as written and rejects non-fixture UUIDs in each of them', async () => {
  const runner = await import('../../scripts/run-c1-cloud-dev-tests.mjs')
  const prefixes = runner.materialSyntheticPrefixes as Record<string, string>
  const files: Array<{ path: string, sql: string }> = []
  runner.runMaterialCloudDevTests({ cwd, run: ({ files: selected }: { files: typeof files }) => files.push(...selected) })
  expect(files).toHaveLength(materialPaths.length)
  for (const file of files) {
    expect(() => runner.validateC1CloudDevSql(file.path, file.sql)).not.toThrow()
    const fixtureId = file.sql.match(new RegExp(String.raw`\b${prefixes[file.path]}[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b`, 'i'))?.[0]
    expect(fixtureId).toBeTruthy()
    expect(() => runner.validateC1CloudDevSql(file.path, file.sql.replace(fixtureId!, 'd0000000-0000-4000-8000-000000000001'))).toThrow(/synthetic UUID/i)
  }
})

it('uses only the dedicated DEV CLI environment and fails without its token', async () => {
  const runner = await import('../../scripts/run-c1-cloud-dev-tests.mjs')
  const files: Array<{ path: string, sql: string }> = []
  runner.runMaterialCloudDevTests({ cwd, run: ({ files: selected }: { files: typeof files }) => files.push(...selected) })
  const spawn = vi.fn(() => ({ status: 0, stdout: '[{"result":"A1_MATERIAL_PGTAP_COMPLETE","finish_count":0}]', stderr: '' }))
  const dedicated = { A1_DEDICATED: 'yes' }
  runner.runC1CloudDevTests({ cwd, files, assertTarget: vi.fn(), spawn, createCliEnvironment: () => dedicated })
  expect(spawn).toHaveBeenCalledTimes(files.length)
  expect(spawn.mock.calls[0]?.[2]?.env).toBe(dedicated)

  spawn.mockClear()
  expect(() => runner.runC1CloudDevTests({
    cwd, files, assertTarget: vi.fn(), spawn,
    env: { TASKOVIA_DEV_CONFIG_SOURCE: 'environment', XDG_STATE_HOME: '/tmp', SUPABASE_DEV_ACCESS_TOKEN: '' },
  })).toThrow(/SUPABASE_DEV_ACCESS_TOKEN/)
  expect(spawn).not.toHaveBeenCalled()
})

it('requires the A1 completion sentinel before treating pgTAP as passed', async () => {
  const runner = await import('../../scripts/run-c1-cloud-dev-tests.mjs')
  const files: Array<{ path: string, sql: string }> = []
  runner.runMaterialCloudDevTests({ cwd, run: ({ files: selected }: { files: typeof files }) => files.push(...selected) })
  expect(() => runner.runC1CloudDevTests({
    cwd, files, assertTarget: vi.fn(), createCliEnvironment: () => ({}),
    spawn: () => ({ status: 0, stdout: '{"rows":[]}', stderr: '' }),
  })).toThrow(/completion/i)
})

it('ends every registered material file with finish(true) followed by rollback, so a failed assertion fails the CLI', async () => {
  const runner = await import('../../scripts/run-c1-cloud-dev-tests.mjs')
  const files: Array<{ path: string, sql: string }> = []
  runner.runMaterialCloudDevTests({ cwd, run: ({ files: selected }: { files: typeof files }) => files.push(...selected) })
  expect(files.map(file => file.path)).toEqual(Object.keys(runner.materialSyntheticPrefixes))
  for (const file of files) {
    const ending = file.sql.replace(/\r\n?/gu, '\n').trim()
    // The A1 file wraps finish(true) in its completion sentinel row.
    expect(ending, file.path).toMatch(/(?:select \* from finish\(true\)|\(select count\(\*\) from finish\(true\)\) as finish_count);\nrollback;$/u)
    expect(ending, file.path).not.toMatch(/finish\(\)/u)
  }
})
