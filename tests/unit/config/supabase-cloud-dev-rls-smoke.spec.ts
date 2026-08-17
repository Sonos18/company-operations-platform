import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const runner = readFileSync(resolve(root, 'scripts/run-supabase-dev.mjs'), 'utf8')

describe('Cloud DEV VQH RLS smoke command', () => {
  it('guards the target and proves member and non-member visibility without identity output', () => {
    expect(packageJson.scripts['db:dev:rls-smoke']).toBe('node scripts/run-supabase-dev.mjs rls-smoke')
    expect(packageJson.scripts['db:dev:canonical-check']).toBe('node scripts/run-supabase-dev.mjs canonical-check')
    expect(runner).toContain("assertCloudDevTarget } from './assert-cloud-dev-target.mjs'")
    expect(runner).toContain("set local role authenticated")
    expect(runner).toContain('90000000-0000-4000-8000-000000000001')
    expect(runner).toContain("select 'PASS' as result;")
    expect(runner).toContain('rollback;')
    expect(runner).toContain("'canonical-check'")
    expect(runner).not.toMatch(/select\s+.*(?:email|user_id).*as/i)
  })
})
