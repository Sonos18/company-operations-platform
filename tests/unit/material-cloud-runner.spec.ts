import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'

it('selects only rollback material SQL through the guarded C1 runner', async () => {
  const runner = await import('../../scripts/run-c1-cloud-dev-tests.mjs')
  expect(runner.runMaterialCloudDevTests).toBeTypeOf('function')

  const run = vi.fn()
  runner.runMaterialCloudDevTests({ cwd: process.cwd(), run })
  expect(run).toHaveBeenCalledOnce()
  const [{ files }] = run.mock.calls[0]!
  expect(files.map((file: { path: string }) => file.path)).toEqual([
    'c1_material_procurement.test.sql',
    'c1_material_procurement_security.test.sql',
  ])
  for (const file of files) {
    expect(file.sql.trim()).toMatch(/^begin\s*;/i)
    expect(file.sql.trim()).toMatch(/rollback\s*;$/i)
  }

  const target = vi.fn()
  const spawn = vi.fn(() => ({ status: 0, stdout: '{"rows":[]}', stderr: '' }))
  runner.runC1CloudDevTests({ cwd: process.cwd(), files, assertTarget: target, spawn })
  expect(target).toHaveBeenCalledOnce()
  expect(spawn).toHaveBeenCalledTimes(2)

  const scriptPath = resolve('scripts/run-c1-cloud-dev-tests.mjs')
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
