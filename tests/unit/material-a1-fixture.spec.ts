import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

it('guards and renders one isolated A1 fixture transaction for existing actors', async () => {
  const fixture = await import('../../scripts/material-a1-fixture.mjs')
  const env = { A1_ENGINEER_EMAIL: 'kysu@vqh.com', A1_BUYER_EMAIL: 'muahang@vqh.com' }
  const target = vi.fn()
  const dedicated = { A1_DEDICATED: 'yes' }
  const spawn = vi.fn((_: unknown, args: string[], options: { env: unknown }) => {
    expect(options.env).toBe(dedicated)
    const sql = readFileSync(args.at(-1)!, 'utf8')
    expect(sql).toMatch(/^begin;/i)
    expect(sql).toContain("'kysu@vqh.com'")
    expect(sql).toContain("'muahang@vqh.com'")
    expect(sql).toContain('a1000000-0000-4000-8000-000000000010')
    expect(sql.trim()).toMatch(/commit;$/i)
    return { status: 0, stdout: '', stderr: '' }
  })
  fixture.runMaterialA1Fixture({ cwd: process.cwd(), env, assertTarget: target, createCliEnvironment: () => dedicated, spawn })
  expect(target).toHaveBeenCalledOnce()
  expect(spawn).toHaveBeenCalledOnce()
})

it('rejects unsafe actor input and wrong Cloud target before writing', async () => {
  const fixture = await import('../../scripts/material-a1-fixture.mjs')
  const spawn = vi.fn()
  const env = { A1_ENGINEER_EMAIL: "x';drop table auth.users;--@test.invalid", A1_BUYER_EMAIL: 'muahang@vqh.com' }
  expect(() => fixture.runMaterialA1Fixture({ cwd: process.cwd(), env, assertTarget: vi.fn(), createCliEnvironment: () => ({}), spawn })).toThrow(/email/i)
  expect(spawn).not.toHaveBeenCalled()
  expect(() => fixture.runMaterialA1Fixture({
    cwd: process.cwd(),
    env: { A1_ENGINEER_EMAIL: 'kysu@vqh.com', A1_BUYER_EMAIL: 'muahang@vqh.com' },
    assertTarget: () => { throw new Error('wrong Cloud target') },
    createCliEnvironment: () => ({}),
    spawn,
  })).toThrow('wrong Cloud target')
  expect(spawn).not.toHaveBeenCalled()

  expect(() => fixture.runMaterialA1Fixture({
    cwd: process.cwd(),
    env: { A1_ENGINEER_EMAIL: 'another@vqh.com', A1_BUYER_EMAIL: 'muahang@vqh.com' },
    assertTarget: vi.fn(), createCliEnvironment: () => ({}), spawn,
  })).toThrow(/approved/i)
  expect(spawn).not.toHaveBeenCalled()
})
