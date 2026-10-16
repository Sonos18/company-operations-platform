import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

it('grants the approved accountant and treasurer finance roles in one A1 Alpha transaction', async () => {
  const fixture = await import('../../scripts/material-a4a5-finance-actors.mjs')
  const target = vi.fn()
  const dedicated = { A4A5_DEDICATED: 'yes' }
  const spawn = vi.fn((_: unknown, args: string[], options: { env: unknown }) => {
    expect(options.env).toBe(dedicated)
    const sql = readFileSync(args.at(-1)!, 'utf8')
    expect(sql).toMatch(/^begin;/i)
    expect(sql.trim()).toMatch(/commit;$/i)
    expect(sql).toContain("'ketoan@vqh.com'")
    expect(sql).toContain("'thuquy@vqh.com'")
    expect(sql).not.toContain('__A4A5_')
    expect(sql).toContain('a1000000-0000-4000-8000-000000000020')
    for (const permission of ['material.read', 'material.finance.read', 'material.contract.record', 'material.payment.request', 'material.payment.approve', 'material.payment.execute']) {
      expect(sql).toContain(`'${permission}'`)
    }
    expect(sql).not.toMatch(/\b(?:delete|update|drop|truncate)\b/i)
    return { status: 0, stdout: '', stderr: '' }
  })
  fixture.runMaterialA4A5FinanceActors({ cwd: process.cwd(), env: {}, assertTarget: target, createCliEnvironment: () => dedicated, spawn })
  expect(target).toHaveBeenCalledOnce()
  expect(spawn).toHaveBeenCalledOnce()
})

it('rejects unapproved actors, a wrong Cloud target and a failed transaction', async () => {
  const fixture = await import('../../scripts/material-a4a5-finance-actors.mjs')
  const spawn = vi.fn()
  const base = { cwd: process.cwd(), assertTarget: vi.fn(), createCliEnvironment: () => ({}), spawn }
  expect(() => fixture.runMaterialA4A5FinanceActors({ ...base, env: { A4A5_TREASURER_EMAIL: "x';drop table auth.users;--@vqh.com" } })).toThrow(/approved/i)
  expect(() => fixture.runMaterialA4A5FinanceActors({ ...base, env: { A4A5_ACCOUNTANT_EMAIL: 'thuquy@vqh.com' } })).toThrow(/approved/i)
  expect(() => fixture.runMaterialA4A5FinanceActors({ ...base, env: {}, assertTarget: () => { throw new Error('wrong Cloud target') } })).toThrow('wrong Cloud target')
  expect(spawn).not.toHaveBeenCalled()

  const failing = vi.fn(() => ({ status: 1, stdout: '', stderr: 'A4/A5 finance role collision' }))
  expect(() => fixture.runMaterialA4A5FinanceActors({ ...base, env: {}, spawn: failing })).toThrow(/stop without retry/)
})
