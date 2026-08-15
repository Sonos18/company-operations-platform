import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const smokeRunner = readFileSync(resolve(root, 'scripts/run-vqh-rls-smoke.mjs'), 'utf8')

describe('Cloud DEV VQH RLS smoke command', () => {
  it('guards the target and proves member and non-member visibility without identity output', () => {
    expect(packageJson.scripts['db:dev:rls-smoke']).toBe(
      'pnpm db:dev:target && node scripts/run-vqh-rls-smoke.mjs',
    )
    expect(smokeRunner).toContain("import { assertCloudDevTarget } from './assert-cloud-dev-target.mjs'")
    expect(smokeRunner).toContain("import { runSupabaseDevCli } from './run-supabase-dev.mjs'")
    expect(smokeRunner).toContain('begin;')
    expect(smokeRunner).toContain("set local role authenticated")
    expect(smokeRunner).toContain('90000000-0000-4000-8000-000000000001')
    expect(smokeRunner).toContain("select 'PASS' as result;")
    expect(smokeRunner).toContain('rollback;')
    expect(smokeRunner).toContain('assertCloudDevTarget()')
    expect(smokeRunner).not.toMatch(/select\s+.*(?:email|user_id).*as/i)
  })
})
